import React, { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface TurnTimerProps {
  currentTurnUserId: string;
  turnPhase: string;
  lastUpdated: number;
  totalDurationSeconds?: number;
}

export const TurnTimer: React.FC<TurnTimerProps> = ({
  currentTurnUserId,
  turnPhase,
  lastUpdated,
  totalDurationSeconds = 15,
}) => {
  const [timeLeft, setTimeLeft] = useState(totalDurationSeconds);

  useEffect(() => {
    const updateCountdown = () => {
      const elapsed = (Date.now() - lastUpdated) / 1000;
      const remaining = Math.max(0, totalDurationSeconds - elapsed);
      setTimeLeft(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 100);

    return () => clearInterval(interval);
  }, [currentTurnUserId, turnPhase, lastUpdated, totalDurationSeconds]);

  const percentage = Math.min(100, Math.max(0, (timeLeft / totalDurationSeconds) * 100));

  // Color transition based on urgency
  let barColor = "#10b981"; // Emerald
  if (timeLeft < 4.5) {
    barColor = "#ef4444"; // Urgent Red
  } else if (timeLeft < 9) {
    barColor = "#f59e0b"; // Warning Amber
  }

  return (
    <div className="turn-timer-container">
      <div className="turn-timer-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <Clock style={{ width: 14, height: 14, color: barColor }} />
          <span>Turn Timer</span>
        </div>
        <span style={{ fontFamily: "monospace", fontSize: "0.85rem", fontWeight: 800, color: barColor }}>
          {timeLeft.toFixed(1)}s
        </span>
      </div>

      <div className="turn-timer-track">
        <div
          className="turn-timer-fill"
          style={{
            width: `${percentage}%`,
            backgroundColor: barColor,
            boxShadow: `0 0 10px ${barColor}`,
          }}
        />
      </div>
    </div>
  );
};
