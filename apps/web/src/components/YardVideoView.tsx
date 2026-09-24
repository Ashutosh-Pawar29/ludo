import React from "react";
import { Video } from "lucide-react";
import { VideoTrackView } from "./VideoTrackView";
import { useParticipantMedia } from "../hooks/useLiveKit";

interface YardVideoViewProps {
  userId: string;
  playerName: string;
  isSelf: boolean;
}

/**
 * Self-contained video component for corner yards on the Ludo board.
 * Subscribes directly to the media store so it re-renders only when
 * the participant's media state changes — completely decoupled from
 * game state updates (dice rolls, token moves, turn changes).
 */
export const YardVideoView: React.FC<YardVideoViewProps> = React.memo(({
  userId,
  playerName,
  isSelf,
}) => {
  const media = useParticipantMedia(userId);
  const hasVideo = Boolean(media.isCameraOn && media.videoTrack);
  const isSpeaking = media.isSpeaking;

  if (!hasVideo) return null;

  return (
    <div className={`yard-video-frame ${isSpeaking ? "yard-speaking" : ""}`}>
      <VideoTrackView
        key={`board-video-${userId}`}
        track={media.videoTrack}
        isSelf={isSelf}
      />
      <div className="yard-video-overlay-badge">
        <span className="yard-video-player-name">{playerName}</span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
          {isSpeaking && <span className="yard-speaking-indicator">Speaking</span>}
          <Video size={11} color="#34d399" />
        </div>
      </div>
    </div>
  );
});

YardVideoView.displayName = "YardVideoView";
