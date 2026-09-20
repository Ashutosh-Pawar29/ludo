export interface GridCoord {
  row: number;
  col: number;
}

// 52 Common track squares mapped to 15x15 grid [row, col]
export const COMMON_TRACK_COORDS: GridCoord[] = [
  /* 0  - Red Start (Safe) */ { row: 6, col: 1 },
  /* 1                     */ { row: 6, col: 2 },
  /* 2                     */ { row: 6, col: 3 },
  /* 3                     */ { row: 6, col: 4 },
  /* 4                     */ { row: 6, col: 5 },
  /* 5                     */ { row: 5, col: 6 },
  /* 6                     */ { row: 4, col: 6 },
  /* 7                     */ { row: 3, col: 6 },
  /* 8  - Safe Spot        */ { row: 2, col: 6 },
  /* 9                     */ { row: 1, col: 6 },
  /* 10                    */ { row: 0, col: 6 },
  /* 11                    */ { row: 0, col: 7 },
  /* 12                    */ { row: 0, col: 8 },
  /* 13 - Green Start (Safe)*/{ row: 1, col: 8 },
  /* 14                    */ { row: 2, col: 8 },
  /* 15                    */ { row: 3, col: 8 },
  /* 16                    */ { row: 4, col: 8 },
  /* 17                    */ { row: 5, col: 8 },
  /* 18                    */ { row: 6, col: 9 },
  /* 19                    */ { row: 6, col: 10 },
  /* 20                    */ { row: 6, col: 11 },
  /* 21 - Safe Spot        */ { row: 6, col: 12 },
  /* 22                    */ { row: 6, col: 13 },
  /* 23                    */ { row: 6, col: 14 },
  /* 24                    */ { row: 7, col: 14 },
  /* 25                    */ { row: 8, col: 14 },
  /* 26 - Yellow Start(Safe)*/{ row: 8, col: 13 },
  /* 27                    */ { row: 8, col: 12 },
  /* 28                    */ { row: 8, col: 11 },
  /* 29                    */ { row: 8, col: 10 },
  /* 30                    */ { row: 8, col: 9 },
  /* 31                    */ { row: 9, col: 8 },
  /* 32                    */ { row: 10, col: 8 },
  /* 33                    */ { row: 11, col: 8 },
  /* 34 - Safe Spot        */ { row: 12, col: 8 },
  /* 35                    */ { row: 13, col: 8 },
  /* 36                    */ { row: 14, col: 8 },
  /* 37                    */ { row: 14, col: 7 },
  /* 38                    */ { row: 14, col: 6 },
  /* 39 - Blue Start (Safe)*/ { row: 13, col: 6 },
  /* 40                    */ { row: 12, col: 6 },
  /* 41                    */ { row: 11, col: 6 },
  /* 42                    */ { row: 10, col: 6 },
  /* 43                    */ { row: 9, col: 6 },
  /* 44                    */ { row: 8, col: 5 },
  /* 45                    */ { row: 8, col: 4 },
  /* 46                    */ { row: 8, col: 3 },
  /* 47 - Safe Spot        */ { row: 8, col: 2 },
  /* 48                    */ { row: 8, col: 1 },
  /* 49                    */ { row: 8, col: 0 },
  /* 50                    */ { row: 7, col: 0 },
  /* 51                    */ { row: 6, col: 0 },
];

export const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];

// Colored home paths (5 steps before center)
export const HOME_PATH_COORDS: Record<string, GridCoord[]> = {
  RED: [
    { row: 7, col: 1 },
    { row: 7, col: 2 },
    { row: 7, col: 3 },
    { row: 7, col: 4 },
    { row: 7, col: 5 },
  ],
  GREEN: [
    { row: 1, col: 7 },
    { row: 2, col: 7 },
    { row: 3, col: 7 },
    { row: 4, col: 7 },
    { row: 5, col: 7 },
  ],
  YELLOW: [
    { row: 7, col: 13 },
    { row: 7, col: 12 },
    { row: 7, col: 11 },
    { row: 7, col: 10 },
    { row: 7, col: 9 },
  ],
  BLUE: [
    { row: 13, col: 7 },
    { row: 12, col: 7 },
    { row: 11, col: 7 },
    { row: 10, col: 7 },
    { row: 9, col: 7 },
  ],
  PURPLE: [
    { row: 7, col: 1 },
    { row: 7, col: 2 },
    { row: 7, col: 3 },
    { row: 7, col: 4 },
    { row: 7, col: 5 },
  ],
  ORANGE: [
    { row: 7, col: 13 },
    { row: 7, col: 12 },
    { row: 7, col: 11 },
    { row: 7, col: 10 },
    { row: 7, col: 9 },
  ],
};

// Base yard slots for each player's 4 tokens [tokenId 0..3]
export const BASE_SLOTS: Record<string, GridCoord[]> = {
  RED: [
    { row: 2, col: 2 },
    { row: 2, col: 3 },
    { row: 3, col: 2 },
    { row: 3, col: 3 },
  ],
  GREEN: [
    { row: 2, col: 11 },
    { row: 2, col: 12 },
    { row: 3, col: 11 },
    { row: 3, col: 12 },
  ],
  YELLOW: [
    { row: 11, col: 11 },
    { row: 11, col: 12 },
    { row: 12, col: 11 },
    { row: 12, col: 12 },
  ],
  BLUE: [
    { row: 11, col: 2 },
    { row: 11, col: 3 },
    { row: 12, col: 2 },
    { row: 12, col: 3 },
  ],
  PURPLE: [
    { row: 6, col: 0 },
    { row: 7, col: 0 },
    { row: 8, col: 0 },
    { row: 9, col: 0 },
  ],
  ORANGE: [
    { row: 6, col: 14 },
    { row: 7, col: 14 },
    { row: 8, col: 14 },
    { row: 9, col: 14 },
  ],
};

// Final home destination in center triangle
export const FINAL_HOME_SLOTS: Record<string, GridCoord> = {
  RED: { row: 7, col: 6 },
  GREEN: { row: 6, col: 7 },
  YELLOW: { row: 7, col: 8 },
  BLUE: { row: 8, col: 7 },
  PURPLE: { row: 7, col: 6 },
  ORANGE: { row: 7, col: 8 },
};

/**
 * Resolves the 15x15 board cell [row, col] for any token based on its step along its journey.
 * Used for box-by-box step animations and final placement.
 */
export function getStepCoordinate(
  color: string,
  tokenId: number,
  step: number,
  boardType: string = "4_PLAYER"
): GridCoord {
  // In base
  if (step <= 0) {
    return BASE_SLOTS[color]?.[tokenId] ?? { row: 0, col: 0 };
  }

  const isFivePlayer = boardType === "5_PLAYER";
  const isSixPlayer = boardType === "6_PLAYER";
  const commonCellsCount = isSixPlayer ? 72 : isFivePlayer ? 60 : 52;
  const totalStepsToHome = isSixPlayer ? 77 : isFivePlayer ? 65 : 57;

  // Reached victory center
  if (step >= totalStepsToHome) {
    return FINAL_HOME_SLOTS[color] ?? { row: 7, col: 7 };
  }

  // Home runway stretch (5 tiles)
  if (step >= commonCellsCount) {
    const homeIndex = Math.min(4, Math.max(0, step - commonCellsCount));
    return HOME_PATH_COORDS[color]?.[homeIndex] ?? { row: 7, col: 7 };
  }

  // Common track
  const startPositions: Record<string, number> = {
    RED: 0,
    GREEN: isSixPlayer || isFivePlayer ? 12 : 13,
    YELLOW: isSixPlayer || isFivePlayer ? 24 : 26,
    BLUE: isSixPlayer || isFivePlayer ? 36 : 39,
    PURPLE: 48,
    ORANGE: 60,
  };

  const startPos = startPositions[color] ?? 0;
  const trackIndex = (startPos + (step - 1)) % COMMON_TRACK_COORDS.length;
  return COMMON_TRACK_COORDS[trackIndex] ?? { row: 7, col: 7 };
}

/**
 * Resolves the 15x15 board cell [row, col] for any token based on its state.
 */
export function getTokenCoordinate(
  color: string,
  tokenId: number,
  status: "BASE" | "ACTIVE" | "HOME",
  step: number,
  position: number,
  boardType: string = "4_PLAYER"
): GridCoord {
  if (status === "BASE" || (position === -1 && step === 0)) {
    return BASE_SLOTS[color]?.[tokenId] ?? { row: 0, col: 0 };
  }
  return getStepCoordinate(color, tokenId, step, boardType);
}
