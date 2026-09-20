import React from "react";
import { AlertTriangle, UserX, X } from "lucide-react";

interface AdminKickModalProps {
  playerName: string;
  userId: string;
  missedCount: number;
  onKick: (userId: string) => void;
  onDismiss: () => void;
}

export const AdminKickModal: React.FC<AdminKickModalProps> = ({
  playerName,
  userId,
  missedCount,
  onKick,
  onDismiss,
}) => {
  return (
    <div
      style={{
        position: "fixed",
        top: "1.5rem",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        width: "90%",
        maxWidth: "420px",
      }}
    >
      <div
        style={{
          background: "rgba(15, 23, 42, 0.95)",
          backdropFilter: "blur(16px)",
          border: "1.5px solid rgba(245, 158, 11, 0.5)",
          borderRadius: "16px",
          padding: "1.25rem",
          boxShadow: "0 20px 50px rgba(0,0,0,0.6), 0 0 30px rgba(245, 158, 11, 0.2)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "0.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#fbbf24" }}>
            <AlertTriangle style={{ width: 20, height: 20 }} />
            <h4 className="font-heading" style={{ fontWeight: 800, fontSize: "0.95rem", color: "#ffffff" }}>
              Inactivity Alert
            </h4>
          </div>
          <button
            onClick={onDismiss}
            style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <p style={{ fontSize: "0.825rem", color: "#cbd5e1", lineHeight: 1.5, marginBottom: "1rem" }}>
          <strong style={{ color: "#ffffff" }}>{playerName}</strong> has missed{" "}
          <strong style={{ color: "#fbbf24" }}>{missedCount} consecutive turns</strong>. Autoplay limit
          reached. As host, you can remove them so other players can proceed.
        </p>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button onClick={onDismiss} className="btn-secondary" style={{ width: "auto", padding: "0.5rem 1rem" }}>
            Dismiss
          </button>
          <button
            onClick={() => onKick(userId)}
            className="btn-danger"
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 1rem" }}
          >
            <UserX style={{ width: 14, height: 14 }} /> Remove Player
          </button>
        </div>
      </div>
    </div>
  );
};
