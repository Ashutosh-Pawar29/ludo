import React, { useEffect, useRef, useState } from "react";
import type { BoardType, GamePlayer, TokenId } from "commons-ts/game";
import { getStepCoordinate, getTokenCoordinate } from "../utils/boardCoordinates";
import { Shield, Sparkles, Star } from "lucide-react";

export interface LudoBoardProps {
  players: GamePlayer[];
  movableTokenIds: TokenId[];
  isMyTurn: boolean;
  onMoveToken: (tokenId: TokenId) => void;
  myUserId?: string;
  boardType?: BoardType;
}

const PLAYER_COLORS: Record<string, { bg: string; border: string; glow: string }> = {
  RED: { bg: "#ef4444", border: "#f87171", glow: "rgba(239, 68, 68, 0.7)" },
  GREEN: { bg: "#10b981", border: "#34d399", glow: "rgba(16, 185, 129, 0.7)" },
  YELLOW: { bg: "#f59e0b", border: "#fbbf24", glow: "rgba(245, 158, 11, 0.7)" },
  BLUE: { bg: "#3b82f6", border: "#60a5fa", glow: "rgba(59, 130, 246, 0.7)" },
  PURPLE: { bg: "#8b5cf6", border: "#a78bfa", glow: "rgba(139, 92, 246, 0.7)" },
  ORANGE: { bg: "#f97316", border: "#fb923c", glow: "rgba(249, 115, 22, 0.7)" },
};

// Safe squares: starting spots + star tiles
const SAFE_CELLS = new Set([
  "6-1",   // Red Start
  "1-8",   // Green Start
  "8-13",  // Yellow Start
  "13-6",  // Blue Start
  "8-1",   // Purple Start
  "2-6",   // Star safe / Orange Start
  "6-12",  // Star safe
  "12-8",  // Star safe
  "8-2",   // Star safe
]);

function playHopSound() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(460, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.07);
  } catch {
    // Silently ignore if audio context is blocked
  }
}

export const LudoBoard: React.FC<LudoBoardProps> = ({
  players,
  movableTokenIds,
  isMyTurn,
  onMoveToken,
  myUserId,
  boardType = "4_PLAYER",
}) => {
  // Animation state: tracks currently displayed step per token
  const [displayedSteps, setDisplayedSteps] = useState<Record<string, number>>({});
  const [hoppingTokens, setHoppingTokens] = useState<Record<string, boolean>>({});
  const displayedStepsRef = useRef<Record<string, number>>({});
  const animIntervalsRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // Sync token steps & trigger box-by-box hopping when step increases
  useEffect(() => {
    players.forEach((player) => {
      player.tokens.forEach((token) => {
        const key = `${player.userId}-${token.id}`;
        const prev = displayedStepsRef.current[key];

        // First mount or new token
        if (prev === undefined) {
          displayedStepsRef.current[key] = token.step;
          setDisplayedSteps((s) => ({ ...s, [key]: token.step }));
          return;
        }

        // Token returned to BASE (captured / reset)
        if (token.step === 0 && prev > 0) {
          if (animIntervalsRef.current[key]) {
            clearInterval(animIntervalsRef.current[key]);
            delete animIntervalsRef.current[key];
          }
          displayedStepsRef.current[key] = 0;
          setDisplayedSteps((s) => ({ ...s, [key]: 0 }));
          setHoppingTokens((h) => ({ ...h, [key]: false }));
          return;
        }

        // Token moving forward: animate step by step
        if (token.step > prev) {
          const target = token.step;
          if (animIntervalsRef.current[key]) {
            clearInterval(animIntervalsRef.current[key]);
          }

          setHoppingTokens((h) => ({ ...h, [key]: true }));

          const interval = setInterval(() => {
            const current = displayedStepsRef.current[key] ?? prev;
            if (current < target) {
              const next = current + 1;
              displayedStepsRef.current[key] = next;
              setDisplayedSteps((s) => ({ ...s, [key]: next }));
              playHopSound();

              if (next >= target) {
                clearInterval(animIntervalsRef.current[key]);
                delete animIntervalsRef.current[key];
                setHoppingTokens((h) => ({ ...h, [key]: false }));
              }
            } else {
              clearInterval(animIntervalsRef.current[key]);
              delete animIntervalsRef.current[key];
              setHoppingTokens((h) => ({ ...h, [key]: false }));
            }
          }, 160);

          animIntervalsRef.current[key] = interval;
        } else if (token.step < prev && token.step > 0) {
          displayedStepsRef.current[key] = token.step;
          setDisplayedSteps((s) => ({ ...s, [key]: token.step }));
        }
      });
    });

    return () => {
      Object.values(animIntervalsRef.current).forEach((interval) => clearInterval(interval));
    };
  }, [players]);

  // Player references
  const redPlayer = players.find((p) => p.color === "RED");
  const greenPlayer = players.find((p) => p.color === "GREEN");
  const yellowPlayer = players.find((p) => p.color === "YELLOW");
  const bluePlayer = players.find((p) => p.color === "BLUE");
  const purplePlayer = players.find((p) => p.color === "PURPLE");
  const orangePlayer = players.find((p) => p.color === "ORANGE");

  // Aggregate tokens that render on the 15x15 board
  const tokensOnBoard: Array<{
    player: GamePlayer;
    tokenId: TokenId;
    row: number;
    col: number;
    isMovable: boolean;
    isHopping: boolean;
    effectiveStep: number;
    status: string;
  }> = [];

  const cellOccupancy: Record<string, number> = {};

  players.forEach((player) => {
    const isPlayerMe = player.userId === myUserId;
    player.tokens.forEach((token) => {
      const key = `${player.userId}-${token.id}`;
      const effectiveStep = displayedSteps[key] ?? token.step;
      const isHopping = !!hoppingTokens[key];

      // Purple and Orange tokens in base (step 0) render inside their dedicated extra yard docks
      const isExtraBaseToken =
        (player.color === "PURPLE" || player.color === "ORANGE") && effectiveStep === 0;

      if (!isExtraBaseToken) {
        const coord =
          effectiveStep === 0
            ? getTokenCoordinate(player.color, token.id, "BASE", 0, -1, boardType)
            : getStepCoordinate(player.color, token.id, effectiveStep, boardType);

        const cellKey = `${coord.row}-${coord.col}`;
        cellOccupancy[cellKey] = (cellOccupancy[cellKey] || 0) + 1;

        const isMovable =
          isMyTurn && isPlayerMe && movableTokenIds.includes(token.id) && !isHopping;

        tokensOnBoard.push({
          player,
          tokenId: token.id,
          row: coord.row,
          col: coord.col,
          isMovable,
          isHopping,
          effectiveStep,
          status: token.status,
        });
      }
    });
  });

  const cellCurrentOffset: Record<string, number> = {};

  // Helper to determine track cell styling
  const renderTrackCell = (r: number, c: number) => {
    // Check if inside any 6x6 yard or 3x3 center
    const isYard =
      (r < 6 && c < 6) ||
      (r < 6 && c > 8) ||
      (r > 8 && c > 8) ||
      (r > 8 && c < 6);
    const isCenter = r >= 6 && r <= 8 && c >= 6 && c <= 8;

    if (isYard || isCenter) return null;

    const cellKey = `${r}-${c}`;
    let cellClass = "track-cell";
    let icon = null;

    // Home path stretches
    if (r === 7 && c >= 1 && c <= 5) {
      cellClass += " red-path";
    } else if (c === 7 && r >= 1 && r <= 5) {
      cellClass += " green-path";
    } else if (r === 7 && c >= 9 && c <= 13) {
      cellClass += " yellow-path";
    } else if (c === 7 && r >= 9 && r <= 13) {
      cellClass += " blue-path";
    }
    // Start tiles
    else if (r === 6 && c === 1) {
      cellClass += " red-start";
      icon = <Shield style={{ width: 11, height: 11, color: "#f87171" }} />;
    } else if (r === 1 && c === 8) {
      cellClass += " green-start";
      icon = <Shield style={{ width: 11, height: 11, color: "#34d399" }} />;
    } else if (r === 8 && c === 13) {
      cellClass += " yellow-start";
      icon = <Shield style={{ width: 11, height: 11, color: "#fbbf24" }} />;
    } else if (r === 13 && c === 6) {
      cellClass += " blue-start";
      icon = <Shield style={{ width: 11, height: 11, color: "#60a5fa" }} />;
    } else if (r === 8 && c === 1) {
      cellClass += " purple-start";
      icon = <Shield style={{ width: 11, height: 11, color: "#c4b5fd" }} />;
    }
    // Star Safe spots
    else if (SAFE_CELLS.has(cellKey)) {
      cellClass += " safe-cell";
      icon = <Star style={{ width: 11, height: 11, color: "#fbbf24", fill: "#fbbf24" }} />;
    }

    return (
      <div
        key={`cell-${cellKey}`}
        className={cellClass}
        style={{
          gridRowStart: r + 1,
          gridColumnStart: c + 1,
        }}
      >
        {icon}
      </div>
    );
  };

  // Helper to render extra dock card for Purple or Orange player in 5/6 player games
  const renderExtraYard = (player: GamePlayer) => {
    const isPlayerMe = player.userId === myUserId;
    const theme = PLAYER_COLORS[player.color] ?? PLAYER_COLORS.PURPLE;
    const isPurple = player.color === "PURPLE";

    return (
      <div
        key={player.userId}
        className={`extra-yard-card ${isPurple ? "yard-purple" : "yard-orange"}`}
      >
        <div
          className="yard-label"
          style={{ color: isPurple ? "#c4b5fd" : "#fdba74" }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: theme.bg,
            }}
          />
          {player.name} ({player.color} BASE)
        </div>
        <div className="extra-yard-docks">
          {([0, 1, 2, 3] as TokenId[]).map((tokenId) => {
            const token = player.tokens.find((t) => t.id === tokenId);
            const key = `${player.userId}-${tokenId}`;
            const effectiveStep = displayedSteps[key] ?? token?.step ?? 0;
            const isInBase = effectiveStep === 0;
            const isMovable =
              isMyTurn && isPlayerMe && movableTokenIds.includes(tokenId);

            return (
              <div key={tokenId} className="extra-dock-slot">
                {isInBase && token && (
                  <button
                    disabled={!isMovable}
                    onClick={() => onMoveToken(tokenId)}
                    style={{
                      backgroundColor: theme.bg,
                      color: "#ffffff",
                      boxShadow: isMovable
                        ? `0 0 16px ${theme.glow}, inset 0 2px 4px rgba(255,255,255,0.4)`
                        : `0 3px 8px rgba(0,0,0,0.6), inset 0 1px 2px rgba(255,255,255,0.25)`,
                      borderColor: isMovable ? "#fef08a" : theme.border,
                    }}
                    className={`ludo-token-btn ${isMovable ? "movable-token" : ""}`}
                    title={`Token ${tokenId + 1} (${player.name})`}
                  >
                    {tokenId + 1}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Generate track grid
  const trackCells: React.ReactNode[] = [];
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const cellNode = renderTrackCell(r, c);
      if (cellNode) trackCells.push(cellNode);
    }
  }

  return (
    <div className="ludo-board-wrapper">
      <div className="ludo-board-grid">
        {/* Track Grid Cells */}
        {trackCells}

        {/* 1. RED YARD (Top Left) */}
        <div className={`yard-base yard-red ${!redPlayer ? "yard-empty" : ""}`}>
          <div className="yard-label" style={{ color: "#fca5a5" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
            {redPlayer ? `${redPlayer.name.toUpperCase()} (RED)` : "RED (EMPTY)"}
          </div>
          <div className="yard-inner-docks">
            <div className="dock-slot" />
            <div className="dock-slot" />
            <div className="dock-slot" />
            <div className="dock-slot" />
          </div>
        </div>

        {/* 2. GREEN YARD (Top Right) */}
        <div className={`yard-base yard-green ${!greenPlayer ? "yard-empty" : ""}`}>
          <div className="yard-label" style={{ color: "#6ee7b7" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
            {greenPlayer ? `${greenPlayer.name.toUpperCase()} (GREEN)` : "GREEN (EMPTY)"}
          </div>
          <div className="yard-inner-docks">
            <div className="dock-slot" />
            <div className="dock-slot" />
            <div className="dock-slot" />
            <div className="dock-slot" />
          </div>
        </div>

        {/* 3. YELLOW YARD (Bottom Right) */}
        <div className={`yard-base yard-yellow ${!yellowPlayer ? "yard-empty" : ""}`}>
          <div className="yard-label" style={{ color: "#fde68a" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b" }} />
            {yellowPlayer ? `${yellowPlayer.name.toUpperCase()} (YELLOW)` : "YELLOW (EMPTY)"}
          </div>
          <div className="yard-inner-docks">
            <div className="dock-slot" />
            <div className="dock-slot" />
            <div className="dock-slot" />
            <div className="dock-slot" />
          </div>
        </div>

        {/* 4. BLUE YARD (Bottom Left) */}
        <div className={`yard-base yard-blue ${!bluePlayer ? "yard-empty" : ""}`}>
          <div className="yard-label" style={{ color: "#93c5fd" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6" }} />
            {bluePlayer ? `${bluePlayer.name.toUpperCase()} (BLUE)` : "BLUE (EMPTY)"}
          </div>
          <div className="yard-inner-docks">
            <div className="dock-slot" />
            <div className="dock-slot" />
            <div className="dock-slot" />
            <div className="dock-slot" />
          </div>
        </div>

        {/* 5. CENTER VICTORY HOME (Rows 7-9, Cols 7-9) */}
        <div className="center-home-area">
          <div className="home-wedge red" />
          <div className="home-wedge green" />
          <div className="home-wedge yellow" />
          <div className="home-wedge blue" />
          <div className="center-star-badge">
            <Sparkles style={{ width: 16, height: 16 }} />
          </div>
        </div>

        {/* 6. TOKENS ON BOARD */}
        {tokensOnBoard.map((item) => {
          const theme = PLAYER_COLORS[item.player.color] ?? PLAYER_COLORS.RED;
          const cellKey = `${item.row}-${item.col}`;
          const totalInCell = cellOccupancy[cellKey] || 1;
          const currentOffsetIndex = cellCurrentOffset[cellKey] || 0;
          cellCurrentOffset[cellKey] = currentOffsetIndex + 1;

          // Compute stacking shift if multiple tokens land on the same tile
          const offsetX = totalInCell > 1 ? (currentOffsetIndex % 2) * 6 - 3 : 0;
          const offsetY = totalInCell > 1 ? Math.floor(currentOffsetIndex / 2) * 6 - 3 : 0;

          return (
            <div
              key={`${item.player.userId}-${item.tokenId}-${item.effectiveStep}`}
              className="ludo-token-wrapper"
              style={{
                gridColumnStart: item.col + 1,
                gridRowStart: item.row + 1,
                transform: `translate(${offsetX}px, ${offsetY}px)`,
              }}
            >
              <button
                disabled={!item.isMovable}
                onClick={() => onMoveToken(item.tokenId)}
                style={{
                  backgroundColor: theme.bg,
                  color: "#ffffff",
                  boxShadow: item.isMovable
                    ? `0 0 16px ${theme.glow}, inset 0 2px 4px rgba(255,255,255,0.4)`
                    : item.isHopping
                    ? `0 0 20px ${theme.glow}`
                    : `0 3px 8px rgba(0,0,0,0.6), inset 0 1px 2px rgba(255,255,255,0.25)`,
                  borderColor: item.isMovable ? "#fef08a" : theme.border,
                }}
                className={`ludo-token-btn ${item.isMovable ? "movable-token" : ""} ${
                  item.isHopping ? "token-hopping" : ""
                }`}
                title={`Token ${item.tokenId + 1} (${item.player.name})`}
              >
                {item.tokenId + 1}
              </button>
            </div>
          );
        })}
      </div>

      {/* Extra Base Yards for 5 and 6 Player Games */}
      {(purplePlayer || orangePlayer) && (
        <div className="extra-yards-dock-row">
          {purplePlayer && renderExtraYard(purplePlayer)}
          {orangePlayer && renderExtraYard(orangePlayer)}
        </div>
      )}
    </div>
  );
};
