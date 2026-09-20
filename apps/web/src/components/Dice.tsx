import React, { useState } from "react";

interface DiceProps {
  value: number | null;
  isRolling: boolean;
  disabled: boolean;
  onRoll: () => void;
  playerColor?: string;
}

export const Dice: React.FC<DiceProps> = ({
  value,
  isRolling,
  disabled,
  onRoll,
  playerColor = "#6366f1",
}) => {
  const [animating, setAnimating] = useState(false);

  const handleClick = () => {
    if (disabled || isRolling) return;
    setAnimating(true);
    setTimeout(() => setAnimating(false), 600);
    onRoll();
  };

  const renderDots = (num: number) => {
    switch (num) {
      case 1:
        return <div className="dot center" />;
      case 2:
        return (
          <>
            <div className="dot top-left" />
            <div className="dot bottom-right" />
          </>
        );
      case 3:
        return (
          <>
            <div className="dot top-left" />
            <div className="dot center" />
            <div className="dot bottom-right" />
          </>
        );
      case 4:
        return (
          <>
            <div className="dot top-left" />
            <div className="dot top-right" />
            <div className="dot bottom-left" />
            <div className="dot bottom-right" />
          </>
        );
      case 5:
        return (
          <>
            <div className="dot top-left" />
            <div className="dot top-right" />
            <div className="dot center" />
            <div className="dot bottom-left" />
            <div className="dot bottom-right" />
          </>
        );
      case 6:
        return (
          <>
            <div className="dot top-left" />
            <div className="dot top-right" />
            <div className="dot mid-left" />
            <div className="dot mid-right" />
            <div className="dot bottom-left" />
            <div className="dot bottom-right" />
          </>
        );
      default:
        return <div className="dot center" style={{ opacity: 0.25 }} />;
    }
  };

  const rolling = isRolling || animating;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
      <button
        onClick={handleClick}
        disabled={disabled || isRolling}
        style={{
          boxShadow: !disabled ? `0 0 30px ${playerColor}99` : "none",
          borderColor: !disabled ? playerColor : "rgba(255,255,255,0.12)",
        }}
        className={`dice-cube ${rolling ? "dice-rolling" : ""} ${
          !disabled ? "dice-active" : "dice-disabled"
        }`}
        title={disabled ? "Waiting for your turn" : "Click to roll dice!"}
      >
        <div className="dice-face">
          {value ? renderDots(value) : <span className="dice-placeholder">🎲</span>}
        </div>
      </button>

      <div style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {!disabled ? (
          <span style={{ color: "#34d399" }}>Your Turn to Roll!</span>
        ) : (
          <span style={{ color: "#94a3b8" }}>{value ? `Rolled: ${value}` : "Roll Dice"}</span>
        )}
      </div>

      <style>{`
        .dice-cube {
          width: 76px;
          height: 76px;
          background: linear-gradient(145deg, #1e293b, #0f172a);
          border: 2.5px solid;
          border-radius: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          user-select: none;
        }
        .dice-active:hover {
          transform: translateY(-4px) scale(1.06);
        }
        .dice-disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .dice-rolling {
          animation: dice-shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
        }
        @keyframes dice-shake {
          10%, 90% { transform: translate3d(-2px, 0, 0) rotate(-6deg); }
          20%, 80% { transform: translate3d(3px, 0, 0) rotate(8deg); }
          30%, 50%, 70% { transform: translate3d(-4px, 0, 0) rotate(-10deg); }
          40%, 60% { transform: translate3d(4px, 0, 0) rotate(10deg); }
        }
        .dice-face {
          position: relative;
          width: 54px;
          height: 54px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-template-rows: repeat(3, 1fr);
          align-items: center;
          justify-items: center;
        }
        .dot {
          width: 10px;
          height: 10px;
          background: white;
          border-radius: 50%;
          box-shadow: 0 0 5px rgba(255,255,255,0.85);
        }
        .top-left { grid-column: 1; grid-row: 1; }
        .top-right { grid-column: 3; grid-row: 1; }
        .mid-left { grid-column: 1; grid-row: 2; }
        .center { grid-column: 2; grid-row: 2; }
        .mid-right { grid-column: 3; grid-row: 2; }
        .bottom-left { grid-column: 1; grid-row: 3; }
        .bottom-right { grid-column: 3; grid-row: 3; }
        .dice-placeholder {
          grid-column: 1 / span 3;
          grid-row: 1 / span 3;
          font-size: 30px;
        }
      `}</style>
    </div>
  );
};
