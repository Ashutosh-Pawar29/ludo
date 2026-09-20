import type { LudoGameState, PlayerColor, TokenId } from "commons-ts/game";

export interface User {
  id: string;
  name: string;
  email: string;
  rank?: number;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
}

export interface RoomDetails {
  id: string;
  adminId: string;
  maxPlayers: number;
  status: string;
}

export type { LudoGameState, PlayerColor, TokenId };
