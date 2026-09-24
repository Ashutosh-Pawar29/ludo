import React, { useEffect, useRef, useState } from "react";
import type { BoardType, GamePlayer, TokenId } from "commons-ts/game";
import { getStepCoordinate, getTokenCoordinate } from "../utils/boardCoordinates";
import { Shield, Sparkles, Star, Video } from "lucide-react";
import { VideoTrackView } from "./VideoTrackView";
import type { ParticipantMediaInfo } from "../hooks/useLiveKit";

export interface LudoBoardProps {
  players: GamePlayer[];
  movableTokenIds: TokenId[];
  isMyTurn: boolean;
  onMoveToken: (tokenId: TokenId) => void;
  myUserId?: string;
  boardType?: BoardType;
  getParticipantMedia?: (userId: string) => ParticipantMediaInfo;
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
  "6-1", // Red Start
  "1-8", // Green Start
  "8-13", // Yellow Start
  "13-6", // Blue Start
  "8-1", // Purple Start
  "2-6", // Star safe / Orange Start
  "6-12", // Star safe
  "12-8", // Star safe
  "8-2", // Star safe
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
  getParticipantMedia,
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
    const media = getParticipantMedia ? getParticipantMedia(player.userId) : undefined;
    const playerHasVideo = Boolean(media?.isCameraOn && media?.videoTrack);

    player.tokens.forEach((token) => {
      const key = `${player.userId}-${token.id}`;
      const effectiveStep = displayedSteps[key] ?? token.step;
      const isHopping = !!hoppingTokens[key];

      // Purple and Orange tokens in base (step 0) render inside their dedicated extra yard docks
      const isExtraBaseToken =
        (player.color === "PURPLE" || player.color === "ORANGE") && effectiveStep === 0;

      // When player has video on, base tokens (step 0) render in the bottom row of their video base
      const isBaseTokenInVideoYard = playerHasVideo && effectiveStep === 0;

      if (!isExtraBaseToken && !isBaseTokenInVideoYard) {
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

  // Helper to render corner yard (with video stream & bottom token row if video ON, or classic square dock if OFF)
  const renderCornerYard = (
    player: GamePlayer | undefined,
    colorName: string,
    yardClass: string,
    labelColor: string
  ) => {
    const isPlayerMe = player?.userId === myUserId;
    const media = player && getParticipantMedia ? getParticipantMedia(player.userId) : undefined;
    const hasVideo = Boolean(player && media?.isCameraOn && media?.videoTrack);
    const isSpeaking = Boolean(media?.isSpeaking);
    const theme = player ? (PLAYER_COLORS[player.color] ?? PLAYER_COLORS.RED) : PLAYER_COLORS.RED;

    if (hasVideo && player) {
      const baseTokens = ([0, 1, 2, 3] as TokenId[]).filter((tokenId) => {
        const token = player.tokens.find((t) => t.id === tokenId);
        const key = `${player.userId}-${tokenId}`;
        const effectiveStep = displayedSteps[key] ?? token?.step ?? 0;
        return effectiveStep === 0;
      });

      return (
        <div
          key={`yard-${colorName}`}
          className={`yard-base ${yardClass} yard-has-video ${isSpeaking ? "yard-speaking" : ""}`}
        >
          {/* Top Video Frame */}
          <div className="yard-video-frame">
            <VideoTrackView track={media!.videoTrack} isSelf={isPlayerMe} />
            <div className="yard-video-overlay-badge">
              <span className="yard-video-player-name">{player.name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                {isSpeaking && <span className="yard-speaking-indicator">Speaking</span>}
                <Video size={11} color="#34d399" />
              </div>
            </div>
          </div>

          {/* Shrunk Base Tokens Row at the Bottom of Base */}
          <div className="yard-bottom-dock">
            {baseTokens.length > 0 ? (
              baseTokens.map((tokenId) => {
                const isMovable = isMyTurn && isPlayerMe && movableTokenIds.includes(tokenId);

                return (
                  <button
                    key={tokenId}
                    disabled={!isMovable}
                    onClick={() => onMoveToken(tokenId)}
                    className={`yard-shrunk-token-btn ${isMovable ? "movable-token" : ""}`}
                    style={{
                      backgroundColor: theme.bg,
                      borderColor: isMovable ? "#fef08a" : theme.border,
                      boxShadow: isMovable
                        ? `0 0 16px ${theme.glow}, inset 0 2px 4px rgba(255,255,255,0.4)`
                        : `0 2px 6px rgba(0,0,0,0.6)`,
                    }}
                    title={
                      isMovable
                        ? `Click to launch Token ${tokenId + 1} into play!`
                        : `Token ${tokenId + 1} waiting in base`
                    }
                  >
                    {tokenId + 1}
                  </button>
                );
              })
            ) : (
              <span className="yard-all-deployed">All In Play</span>
            )}
          </div>
        </div>
      );
    }

    // Default Classic Yard when video is OFF or player not present
    return (
      <div key={`yard-${colorName}`} className={`yard-base ${yardClass} ${!player ? "yard-empty" : ""}`}>
        <div className="yard-label" style={{ color: labelColor }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: theme.bg }} />
          {player ? `${player.name.toUpperCase()} (${colorName})` : `${colorName} (EMPTY)`}
        </div>
        <div className="yard-inner-docks">
          <div className="dock-slot" />
          <div className="dock-slot" />
          <div className="dock-slot" />
          <div className="dock-slot" />
        </div>
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
        {renderCornerYard(redPlayer, "RED", "yard-red", "#fca5a5")}

        {/* 2. GREEN YARD (Top Right) */}
        {renderCornerYard(greenPlayer, "GREEN", "yard-green", "#6ee7b7")}

        {/* 3. YELLOW YARD (Bottom Right) */}
        {renderCornerYard(yellowPlayer, "YELLOW", "yard-yellow", "#fde68a")}

        {/* 4. BLUE YARD (Bottom Left) */}
        {renderCornerYard(bluePlayer, "BLUE", "yard-blue", "#93c5fd")}

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
        {(() => {
          // Pre-group tokens by cell to calculate optimal layout and stacking
          const tokensByCell: Record<string, typeof tokensOnBoard> = {};
          const cellHasMovable: Record<string, boolean> = {};

          tokensOnBoard.forEach((t) => {
            const cellKey = `${t.row}-${t.col}`;
            if (!tokensByCell[cellKey]) tokensByCell[cellKey] = [];
            tokensByCell[cellKey].push(t);
            if (t.isMovable) {
              cellHasMovable[cellKey] = true;
            }
          });

          return tokensOnBoard.map((item) => {
            const theme = PLAYER_COLORS[item.player.color] ?? PLAYER_COLORS.RED;
            const cellKey = `${item.row}-${item.col}`;
            const cellTokens = tokensByCell[cellKey] || [item];
            const totalInCell = cellTokens.length;
            const tokenIndex = cellTokens.indexOf(item);
            const isAnyMovableInCell = Boolean(cellHasMovable[cellKey]);

            // Layout offsets for multiple tokens in the same cell
            let offsetX = 0;
            let offsetY = 0;
            let scale = 1;

            if (totalInCell === 2) {
              scale = 0.85;
              if (tokenIndex === 0) {
                offsetX = -7;
                offsetY = -5;
              } else {
                offsetX = 7;
                offsetY = 5;
              }
            } else if (totalInCell === 3) {
              scale = 0.78;
              if (tokenIndex === 0) {
                offsetX = -7;
                offsetY = -6;
              } else if (tokenIndex === 1) {
                offsetX = 7;
                offsetY = -6;
              } else {
                offsetX = 0;
                offsetY = 6;
              }
            } else if (totalInCell >= 4) {
              scale = 0.74;
              const positions = [
                [-7, -7],
                [7, -7],
                [-7, 7],
                [7, 7],
              ];
              const pos = positions[tokenIndex % 4] || [0, 0];
              offsetX = pos[0];
              offsetY = pos[1];
            }

            // If this token is movable, pop it to center with high elevation!
            if (item.isMovable) {
              offsetY = -7;
              offsetX = 0;
            }

            // Elevation: movable token sits on top (z-index: 150), hopping token (120), static tokens (20-30)
            const zIndex = item.isMovable
              ? 150
              : item.isHopping
              ? 120
              : 20 + tokenIndex;

            // If a cell has a movable token for the player whose turn it is,
            // set pointer-events: none on other unmovable tokens in this cell
            // so any click/tap in the cell registers directly on the movable token!
            const pointerEvents = isAnyMovableInCell && !item.isMovable ? "none" : "auto";

            return (
              <div
                key={`${item.player.userId}-${item.tokenId}-${item.effectiveStep}`}
                className={`ludo-token-wrapper ${item.isMovable ? "token-elevated" : ""}`}
                style={{
                  gridColumnStart: item.col + 1,
                  gridRowStart: item.row + 1,
                  transform: `translate(${offsetX}px, ${offsetY}px)`,
                  zIndex,
                  pointerEvents,
                }}
              >
                <button
                  disabled={!item.isMovable}
                  onClick={() => onMoveToken(item.tokenId)}
                  style={{
                    backgroundColor: theme.bg,
                    color: "#ffffff",
                    transform: item.isMovable ? undefined : `scale(${scale})`,
                    boxShadow: item.isMovable
                      ? `0 0 18px ${theme.glow}, inset 0 2px 4px rgba(255,255,255,0.4)`
                      : item.isHopping
                      ? `0 0 20px ${theme.glow}`
                      : `0 3px 8px rgba(0,0,0,0.6), inset 0 1px 2px rgba(255,255,255,0.25)`,
                    borderColor: item.isMovable ? "#fef08a" : theme.border,
                  }}
                  className={`ludo-token-btn ${item.isMovable ? "movable-token" : ""} ${
                    item.isHopping ? "token-hopping" : ""
                  }`}
                  title={
                    item.isMovable
                      ? `Click to move Token ${item.tokenId + 1} (${item.player.name})`
                      : `Token ${item.tokenId + 1} (${item.player.name})`
                  }
                >
                  {item.tokenId + 1}
                </button>
              </div>
            );
          });
        })()}
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
