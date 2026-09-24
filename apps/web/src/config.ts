// Configuration for backend API, WebSocket, and LiveKit SFU
export const API_BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
export const WS_BASE_URL = (import.meta.env.VITE_WS_URL || "").replace(/\/+$/, "");
export const LIVEKIT_SERVER_URL = (import.meta.env.VITE_LIVEKIT_URL || "").replace(/\/+$/, "");

/**
 * Returns full URL for an API endpoint.
 * - When VITE_API_URL is set (e.g. on Vercel): returns "https://api.yourdomain.com/api/..."
 * - When VITE_API_URL is unset (e.g. local or single-host EC2): returns "/api/..."
 */
export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (API_BASE_URL) {
    return `${API_BASE_URL}${cleanPath}`;
  }
  return cleanPath;
}

/**
 * Returns full WebSocket URL for game engine connection.
 * - When VITE_WS_URL is set (e.g. on Vercel): returns "wss://api.yourdomain.com/ws?token=...&roomId=..."
 * - When VITE_WS_URL is unset: returns "ws(s)://<host>/ws?token=...&roomId=..."
 */
export function getWsUrl(token: string, roomId: string): string {
  const query = `token=${encodeURIComponent(token)}&roomId=${encodeURIComponent(roomId)}`;
  if (WS_BASE_URL) {
    const separator = WS_BASE_URL.includes("?") ? "&" : "?";
    return `${WS_BASE_URL}${separator}${query}`;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws?${query}`;
}
