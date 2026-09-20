import React, { useEffect } from "react";
import confetti from "canvas-confetti";
import { Trophy, Medal, RotateCcw } from "lucide-react";
import type { GamePlayer } from "commons-ts/game";

interface GameOverModalProps {
  winnerId: string;
  rankings: string[];
  players: GamePlayer[];
  onPlayAgain: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  winnerId,
  rankings,
  players,
  onPlayAgain,
}) => {
  useEffect(() => {
    // Confetti celebration
    const end = Date.now() + 3000;
    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, []);

  const winner = players.find((p) => p.userId === winnerId);

  return (
    <div className="modal-overlay">
      <div
        className="auth-card"
        style={{
          maxWidth: "460px",
          textAlign: "center",
          borderColor: "rgba(245, 158, 11, 0.5)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.8), 0 0 40px rgba(245, 158, 11, 0.25)",
        }}
      >
        <div
          style={{
            width: "68px",
            height: "68px",
            margin: "0 auto 1.25rem",
            borderRadius: "20px",
            background: "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 10px 25px rgba(245, 158, 11, 0.4)",
          }}
        >
          <Trophy style={{ width: 36, height: 36, color: "#1e1b4b" }} />
        </div>

        <h2 className="auth-title" style={{ fontSize: "1.8rem" }}>
          Match Finished!
        </h2>
        <p style={{ fontSize: "0.95rem", color: "#cbd5e1", marginTop: "0.25rem", marginBottom: "1.5rem" }}>
          <strong style={{ color: "#fbbf24" }}>{winner?.name || "Player"}</strong> has captured the victory!
        </p>

        {/* Podium list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.5rem" }}>
          {rankings.map((userId, index) => {
            const player = players.find((p) => p.userId === userId);
            const isFirst = index === 0;

            return (
              <div
                key={userId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1rem",
                  borderRadius: "12px",
                  background: isFirst ? "rgba(245, 158, 11, 0.12)" : "rgba(15, 23, 42, 0.6)",
                  border: isFirst ? "1.5px solid rgba(245, 158, 11, 0.4)" : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <span
                    style={{
                      width: "28px",
                      height: "28px",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "var(--font-heading)",
                      fontWeight: 800,
                      fontSize: "0.85rem",
                      background: isFirst ? "#f59e0b" : "#334155",
                      color: isFirst ? "#1e1b4b" : "#ffffff",
                    }}
                  >
                    #{index + 1}
                  </span>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#ffffff" }}>
                      {player?.name || "Player"}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>{player?.color} TEAM</div>
                  </div>
                </div>

                {isFirst && <Medal style={{ width: 22, height: 22, color: "#fbbf24" }} />}
              </div>
            );
          })}
        </div>

        <button onClick={onPlayAgain} className="btn-primary">
          <RotateCcw style={{ width: 16, height: 16 }} /> Return to Lobby
        </button>
      </div>
    </div>
  );
};
