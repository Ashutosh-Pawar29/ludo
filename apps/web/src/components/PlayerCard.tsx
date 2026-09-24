import React from "react";
import type { GamePlayer } from "commons-ts/game";
import { Crown, Wifi, WifiOff, Mic, MicOff, Video } from "lucide-react";
import { VideoTrackView } from "./VideoTrackView";
import { useParticipantMedia } from "../hooks/useLiveKit";

interface PlayerCardProps {
  player: GamePlayer;
  isCurrentTurn: boolean;
  isHost: boolean;
  isSelf: boolean;
}

const COLOR_CONFIG: Record<string, { bg: string; border: string; glow: string }> = {
  RED: { bg: "#ef4444", border: "#f87171", glow: "rgba(239, 68, 68, 0.5)" },
  GREEN: { bg: "#10b981", border: "#34d399", glow: "rgba(16, 185, 129, 0.5)" },
  YELLOW: { bg: "#f59e0b", border: "#fbbf24", glow: "rgba(245, 158, 11, 0.5)" },
  BLUE: { bg: "#3b82f6", border: "#60a5fa", glow: "rgba(59, 130, 246, 0.5)" },
  PURPLE: { bg: "#8b5cf6", border: "#a78bfa", glow: "rgba(139, 92, 246, 0.5)" },
  ORANGE: { bg: "#f97316", border: "#fb923c", glow: "rgba(249, 115, 22, 0.5)" },
};

const CORNER_NAMES: Record<string, string> = {
  RED: "Top-Left Base",
  GREEN: "Top-Right Base",
  YELLOW: "Bottom-Right Base (Diagonal)",
  BLUE: "Bottom-Left Base (Diagonal)",
  PURPLE: "Purple Bay",
  ORANGE: "Orange Bay",
};

export const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  isCurrentTurn,
  isHost,
  isSelf,
}) => {
  // Subscribe directly to the media store — only re-renders when THIS player's media changes
  const mediaInfo = useParticipantMedia(player.userId);

  const theme = COLOR_CONFIG[player.color] ?? COLOR_CONFIG.RED;
  const homeCount = player.tokens.filter((t) => t.status === "HOME").length;
  const activeCount = player.tokens.filter((t) => t.status === "ACTIVE").length;
  const baseCount = player.tokens.filter((t) => t.status === "BASE").length;

  const isSpeaking = Boolean(mediaInfo?.isSpeaking);
  const isMicOn = Boolean(mediaInfo?.isMicOn);
  const isCameraOn = Boolean(mediaInfo?.isCameraOn && mediaInfo?.videoTrack);

  return (
    <div
      className={`player-card ${isCurrentTurn ? "active-turn" : ""}`}
      style={{
        boxShadow: isCurrentTurn ? `0 0 25px ${theme.glow}` : undefined,
        borderColor: isCurrentTurn ? theme.border : undefined,
      }}
    >
      {/* Top accent turn line */}
      {isCurrentTurn && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "3px",
            background: theme.bg,
            boxShadow: `0 0 10px ${theme.bg}`,
          }}
        />
      )}

      <div className="player-card-header">
        <div className="player-info-group">
          {/* Avatar / Video Feed Container */}
          <div
            className={`player-media-tile ${isSpeaking ? "speaking-active" : ""}`}
            style={{
              borderColor: isSpeaking ? "#10b981" : theme.border,
            }}
          >
            {isCameraOn && mediaInfo?.videoTrack ? (
              <div className="player-video-container">
                <VideoTrackView key={`pc-video-${player.userId}`} track={mediaInfo.videoTrack} isSelf={isSelf} />
                <span className="live-cam-badge">
                  <Video size={10} color="#ffffff" />
                </span>
              </div>
            ) : (
              <div className="player-avatar" style={{ backgroundColor: theme.bg }}>
                {player.name.slice(0, 2).toUpperCase()}
              </div>
            )}

            {/* Speaking / Mic Status Pin */}
            <div
              className={`mic-status-pin ${isMicOn ? "mic-active" : "mic-muted"}`}
              title={isMicOn ? (isSpeaking ? "Speaking" : "Microphone On") : "Microphone Muted"}
            >
              {isMicOn ? <Mic size={11} color="#ffffff" /> : <MicOff size={11} color="#cbd5e1" />}
            </div>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span className="player-name-text">{player.name}</span>
              {isSelf && <span className="pill-tag self">YOU</span>}
              {isHost && (
                <span title="Host">
                  <Crown style={{ width: 14, height: 14, color: "#fbbf24" }} />
                </span>
              )}
            </div>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, color: theme.border }}>
              {player.color} • {CORNER_NAMES[player.color] ?? "BASE"}
            </div>
          </div>
        </div>

        {/* Online/Offline Status */}
        <div>
          {player.isDisconnected ? (
            <span className="connection-pill offline">
              <WifiOff style={{ width: 12, height: 12 }} /> Offline
            </span>
          ) : (
            <span className="connection-pill online">
              <Wifi style={{ width: 12, height: 12 }} /> Online
            </span>
          )}
        </div>
      </div>

      {/* Missed Turns Warning */}
      {(player.missedTurns ?? 0) > 0 && (
        <div
          style={{
            marginBottom: "0.5rem",
            padding: "0.25rem 0.5rem",
            borderRadius: "6px",
            background: "rgba(245, 158, 11, 0.15)",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            color: "#fbbf24",
            fontSize: "0.75rem",
            fontWeight: 700,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>Autoplay timeouts:</span>
          <span>{player.missedTurns}/5</span>
        </div>
      )}

      {/* Token Progress Counters */}
      <div className="token-stats-row">
        <div className="token-stat-badge">
          <span className="token-stat-label">BASE</span>
          <span className="token-stat-val">{baseCount}</span>
        </div>
        <div className="token-stat-badge">
          <span className="token-stat-label">TRACK</span>
          <span className="token-stat-val" style={{ color: "#34d399" }}>
            {activeCount}
          </span>
        </div>
        <div className="token-stat-badge">
          <span className="token-stat-label">HOME</span>
          <span className="token-stat-val" style={{ color: "#fbbf24" }}>
            {homeCount}/4
          </span>
        </div>
      </div>
    </div>
  );
};

PlayerCard.displayName = "PlayerCard";
