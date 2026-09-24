import React, { useState } from "react";
import { Copy, Check, Users, Play, PlusCircle, ArrowRight } from "lucide-react";
import type { User } from "../types";
import { getApiUrl } from "../config";

interface LobbyProps {
  user: User;
  token: string;
  onEnterGame: (roomId: string, isHost: boolean) => void;
  waitingRoomId: string | null;
  setWaitingRoomId: (id: string | null) => void;
  connectedPlayerCount?: number;
  maxPlayersSetting?: number;
  lobbyPlayers?: { userId: string; name: string }[];
  onStartGame?: () => void;
  isHost?: boolean;
  onLogout?: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({
  user,
  token,
  onEnterGame,
  waitingRoomId,
  setWaitingRoomId,
  connectedPlayerCount = 1,
  maxPlayersSetting,
  lobbyPlayers = [],
  onStartGame,
  isHost = false,
  onLogout,
}) => {
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [joinRoomInput, setJoinRoomInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateRoom = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl("/api/create-room"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          token,
        },
        body: JSON.stringify({
          id: user.id,
          maxPlayers: Number(maxPlayers),
        }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        const text = await res.text().catch(() => "");
        data = { message: text };
      }

      if (res.status === 401 || data?.error === "invalid_token" || data?.error === "user_not_found" || data?.message === "invalid token") {
        setError("Session expired. Signing out to allow fresh login...");
        if (onLogout) {
          setTimeout(() => onLogout(), 1000);
        }
        return;
      }

      if (res.ok && data?.room?.id) {
        onEnterGame(data.room.id, true);
      } else {
        setError(data?.message || data?.error || "Failed to create room");
      }
    } catch (err: any) {
      setError(err?.message || "Network error connecting to backend");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinRoomInput.trim()) return;
    setLoading(true);
    setError(null);

    let roomId = joinRoomInput.trim();
    if (roomId.includes("room=")) {
      try {
        const url = new URL(roomId);
        roomId = url.searchParams.get("room") || roomId;
      } catch (e) {
        // use raw input
      }
    }

    try {
      const res = await fetch(getApiUrl("/api/join-room"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          token,
        },
        body: JSON.stringify({
          userid: user.id,
          roomid: roomId,
        }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        const text = await res.text().catch(() => "");
        data = { message: text };
      }

      if (res.status === 401 || data?.error === "invalid_token" || data?.error === "user_not_found" || data?.message === "invalid token") {
        setError("Session expired. Signing out to allow fresh login...");
        if (onLogout) {
          setTimeout(() => onLogout(), 1000);
        }
        return;
      }

      if (res.ok && (data.player || data.msg === "player joined" || data.message === "player joined")) {
        onEnterGame(roomId, false);
      } else {
        setError(data?.message || data?.error || "Could not join room");
      }
    } catch (err: any) {
      setError(err?.message || "Network error joining room");
    } finally {
      setLoading(false);
    }
  };

  const copyRoomLink = () => {
    if (!waitingRoomId) return;
    const inviteUrl = `${window.location.origin}/?room=${waitingRoomId}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="lobby-wrapper">
      <div className="lobby-header">
        <h1 className="lobby-title">
          LUDO <span>ARENA</span>
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
          Real-Time Multiplayer Dice Battles
        </p>
      </div>

      {error && (
        <div className="alert-box" style={{ justifyContent: "center" }}>
          <span>{error}</span>
        </div>
      )}

      {/* WAITING ROOM VIEW */}
      {waitingRoomId ? (
        <div className="lobby-card glass-panel" style={{ textAlign: "center" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "rgba(99, 102, 241, 0.2)",
              color: "#818cf8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1rem",
            }}
          >
            <Users size={28} />
          </div>

          <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#fff" }}>Match Lobby</h3>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "0.25rem 0 1.25rem" }}>
            Send this invite code or link to your friend to play
          </p>

          {/* Copy Box */}
          <div
            style={{
              background: "rgba(15, 23, 42, 0.9)",
              border: "1.5px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "14px",
              padding: "0.75rem 1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              marginBottom: "1rem",
            }}
          >
            <span
              style={{
                fontFamily: "monospace",
                fontSize: "0.85rem",
                color: "#a5b4fc",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                userSelect: "all",
              }}
            >
              {waitingRoomId}
            </span>
            <button
              onClick={copyRoomLink}
              className="btn btn-secondary"
              style={{ width: "auto", padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}
            >
              {copied ? (
                <>
                  <Check size={14} color="#10b981" /> Copied!
                </>
              ) : (
                <>
                  <Copy size={14} /> Copy
                </>
              )}
            </button>
          </div>

          <div
            style={{
              background: "rgba(99, 102, 241, 0.1)",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              borderRadius: "12px",
              padding: "0.75rem 1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.85rem",
              marginBottom: "1rem",
            }}
          >
            <span style={{ color: "#cbd5e1" }}>Connected Players:</span>
            <span style={{ fontWeight: 800, color: "#10b981", fontSize: "1.1rem" }}>
              {connectedPlayerCount} / {maxPlayersSetting || maxPlayers}
            </span>
          </div>

          {/* Connected player names list */}
          {lobbyPlayers && lobbyPlayers.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", justifyContent: "center", marginBottom: "1.25rem" }}>
              {lobbyPlayers.map((p, idx) => (
                <div
                  key={p.userId || idx}
                  style={{
                    background: "rgba(15, 23, 42, 0.8)",
                    border: "1px solid rgba(99, 102, 241, 0.35)",
                    borderRadius: "9999px",
                    padding: "0.3rem 0.8rem",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
                  {p.name} {p.userId === user.id ? "(You)" : ""}
                </div>
              ))}
            </div>
          )}

          {isHost ? (
            <button
              onClick={onStartGame}
              disabled={connectedPlayerCount < 2}
              className="btn btn-primary"
              style={{ fontSize: "1.05rem", padding: "0.95rem" }}
            >
              <Play size={20} fill="currentColor" />
              {connectedPlayerCount < 2 ? "Waiting for Friend to Join..." : "Start Match Now!"}
            </button>
          ) : (
            <div style={{ color: "#fbbf24", fontSize: "0.85rem", fontWeight: 600, padding: "0.5rem" }}>
              Waiting for room host to click Start Match...
            </div>
          )}

          <button onClick={() => setWaitingRoomId(null)} className="btn-link">
            Leave Lobby
          </button>
        </div>
      ) : (
        /* CREATE OR JOIN ROOM VIEW */
        <div>
          {/* Create Match */}
          <div className="lobby-card">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                color: "#818cf8",
                fontWeight: 700,
                fontSize: "0.95rem",
                marginBottom: "0.75rem",
              }}
            >
              <PlusCircle size={18} /> Create Private Match
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label className="form-label" style={{ display: "block", marginBottom: "0.5rem" }}>
                Select Players
              </label>
              <div className="player-chips">
                {[2, 3, 4, 5, 6].map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setMaxPlayers(count)}
                    className={`chip-btn ${maxPlayers === count ? "active" : ""}`}
                  >
                    {count}P
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleCreateRoom}
              disabled={loading}
              className="btn btn-primary"
            >
              <PlusCircle size={18} /> Create Room & Invite Friend
            </button>
          </div>

          {/* Join Match */}
          <div className="lobby-card">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                color: "#10b981",
                fontWeight: 700,
                fontSize: "0.95rem",
                marginBottom: "0.75rem",
              }}
            >
              <Users size={18} /> Join Friend's Room
            </div>

            <form onSubmit={handleJoinRoom}>
              <div className="form-group">
                <input
                  type="text"
                  value={joinRoomInput}
                  onChange={(e) => setJoinRoomInput(e.target.value)}
                  placeholder="Paste Room Code or Invite Link"
                  required
                  className="form-input"
                  style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
                />
              </div>

              <button
                type="submit"
                disabled={loading || !joinRoomInput.trim()}
                className="btn btn-secondary"
              >
                Join Match <ArrowRight size={18} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
