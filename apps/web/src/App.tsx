import React, { useEffect, useRef, useState } from "react";
import type { AuthState, User } from "./types";
import type { ClientMessage, LudoGameState, ServerMessage, TokenId } from "commons-ts/game";
import { AuthModal } from "./components/AuthModal";
import { Lobby } from "./components/Lobby";
import { LudoBoard } from "./components/LudoBoard";
import { Dice } from "./components/Dice";
import { TurnTimer } from "./components/TurnTimer";
import { PlayerCard } from "./components/PlayerCard";
import { AdminKickModal } from "./components/AdminKickModal";
import { GameOverModal } from "./components/GameOverModal";
import { LogOut, Wifi, WifiOff } from "lucide-react";

export const App: React.FC = () => {
  // Auth state
  const [token, setToken] = useState<string | null>(localStorage.getItem("ludo_token"));
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("ludo_user");
    return saved ? JSON.parse(saved) : null;
  });
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Room & WebSocket state
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [gameState, setGameState] = useState<LudoGameState | null>(null);
  const [connectedPlayerCount, setConnectedPlayerCount] = useState(1);
  const [roomMaxPlayers, setRoomMaxPlayers] = useState(2);
  const [lobbyPlayers, setLobbyPlayers] = useState<{ userId: string; name: string }[]>([]);

  // Kick modal state (for host)
  const [inactiveAlert, setInactiveAlert] = useState<{
    userId: string;
    name: string;
    missedCount: number;
  } | null>(null);

  // Notification / toast message
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check URL query parameters for invited room
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get("room");
    if (roomFromUrl && !roomId) {
      setRoomId(roomFromUrl);
    }
  }, []);

  // Fetch current user details if token exists
  useEffect(() => {
    if (token && (!user || !user.id)) {
      fetch("/api/users/me", {
        headers: { token },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.id) {
            setUser(data);
            localStorage.setItem("ludo_user", JSON.stringify(data));
          }
        })
        .catch(console.error);
    }
  }, [token]);

  // Fallback lobby polling for player count & room info
  useEffect(() => {
    if (!roomId || (gameState && gameState.status !== "WAITING")) return;

    const syncRoom = () => {
      fetch(`/api/rooms/${roomId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data?.players && Array.isArray(data.players)) {
            setConnectedPlayerCount((prev) => Math.max(prev, data.players.length));
          }
          if (data?.room?.maxPlayers) {
            setRoomMaxPlayers(data.room.maxPlayers);
          }
        })
        .catch(() => {});
    };

    syncRoom();
    const interval = setInterval(syncRoom, 2500);
    return () => clearInterval(interval);
  }, [roomId, gameState]);

  // Connect WebSocket when room is selected and token exists
  useEffect(() => {
    if (!token || !roomId) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/ws?token=${encodeURIComponent(
      token
    )}&roomId=${encodeURIComponent(roomId)}`;

    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      setWsConnected(true);
      // Keep alive ping
      pingIntervalRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "PING" }));
        }
      }, 20000);
    };

    socket.onmessage = (event) => {
      try {
        if (event.data === "PONG") return;
        const msg: ServerMessage = JSON.parse(event.data);

        switch (msg.type) {
          case "ROOM_PLAYERS_UPDATE":
            setConnectedPlayerCount(msg.count);
            if (msg.maxPlayers) setRoomMaxPlayers(msg.maxPlayers);
            if (msg.players) setLobbyPlayers(msg.players);
            break;

          case "GAME_STATE":
            setGameState(msg.state);
            setConnectedPlayerCount(msg.state.players.length);
            break;

          case "DICE_ROLLED":
            setGameState((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                currentDice: msg.dice,
                movableTokenIds: msg.movableTokenIds,
                turnPhase: msg.autoPassedTurn ? "ROLL_DICE" : "MOVE_TOKEN",
                lastUpdated: Date.now(),
              };
            });

            // Automatically move if only one token is eligible to move!
            if (!msg.autoPassedTurn && msg.movableTokenIds.length === 1 && msg.userId === userRef.current?.id) {
              const singleTokenId = msg.movableTokenIds[0]!;
              setTimeout(() => {
                sendWsMessage({ type: "MOVE_TOKEN", tokenId: singleTokenId });
              }, 500);
            }
            break;

          case "TOKEN_MOVED":
            setGameState((prev) => {
              if (!prev) return null;
              const updatedPlayers = prev.players.map((p) => {
                if (p.userId === msg.userId) {
                  const updatedTokens = p.tokens.map((t) => {
                    if (t.id === msg.tokenId) {
                      return {
                        ...t,
                        position: msg.newPosition,
                        step: msg.newStep,
                        status: msg.newPosition === -1 && msg.newStep > 0 ? ("HOME" as const) : ("ACTIVE" as const),
                      };
                    }
                    return t;
                  });
                  return { ...p, tokens: updatedTokens };
                }
                if (msg.killedToken && p.userId === msg.killedToken.userId) {
                  const updatedTokens = p.tokens.map((t) => {
                    if (t.id === msg.killedToken!.tokenId) {
                      return { ...t, status: "BASE" as const, step: 0, position: -1 };
                    }
                    return t;
                  });
                  return { ...p, tokens: updatedTokens };
                }
                return p;
              });
              return { ...prev, players: updatedPlayers, lastUpdated: Date.now() };
            });
            break;

          case "TURN_CHANGED":
            setGameState((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                currentTurnUserId: msg.currentTurnUserId,
                turnPhase: msg.turnPhase,
                currentDice: null,
                movableTokenIds: [],
                lastUpdated: Date.now(),
              };
            });
            break;

          case "PLAYER_INACTIVE_LIMIT":
            setInactiveAlert({
              userId: msg.userId,
              name: msg.name,
              missedCount: msg.missedCount,
            });
            break;

          case "PLAYER_KICKED":
            if (user && msg.userId === user.id) {
              alert("You were removed from the room by the host.");
              setRoomId(null);
              setGameState(null);
            }
            break;

          case "GAME_OVER":
            setGameState((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                status: "COMPLETED",
                winnerId: msg.winnerId,
                rankings: msg.rankings,
              };
            });
            break;

          case "ERROR":
            showToast(msg.message);
            break;
        }
      } catch (e) {
        console.error("Error parsing message", e);
      }
    };

    socket.onclose = () => {
      setWsConnected(false);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };

    return () => {
      socket.close();
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, [token, roomId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const sendWsMessage = (msg: ClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  };

  // Actions
  const handleAuthSuccess = (auth: AuthState) => {
    setToken(auth.token);
    setUser(auth.user);
    if (auth.token) localStorage.setItem("ludo_token", auth.token);
    if (auth.user) localStorage.setItem("ludo_user", JSON.stringify(auth.user));
  };

  const handleLogout = () => {
    setToken(null);
    setUser(null);
    setRoomId(null);
    setGameState(null);
    localStorage.removeItem("ludo_token");
    localStorage.removeItem("ludo_user");
  };

  const handleStartGame = () => {
    sendWsMessage({ type: "START_GAME" });
  };

  const handleRollDice = () => {
    sendWsMessage({ type: "ROLL_DICE" });
  };

  const handleMoveToken = (tokenId: TokenId) => {
    sendWsMessage({ type: "MOVE_TOKEN", tokenId });
  };

  const handleKickPlayer = (targetUserId: string) => {
    sendWsMessage({ type: "KICK_PLAYER", targetUserId });
    setInactiveAlert(null);
  };

  // If not authenticated, display AuthModal
  if (!token || !user) {
    return <AuthModal onSuccess={handleAuthSuccess} />;
  }

  const isMyTurn = gameState?.currentTurnUserId === user.id;
  const currentPlayer = gameState?.players.find((p) => p.userId === gameState.currentTurnUserId);

  return (
    <div className="app-container">
      {/* Top Navigation Bar */}
      <header className="app-header">
        <div className="app-brand">
          <div className="brand-logo-icon">
            <span style={{ fontSize: "1.1rem" }}>🎲</span>
          </div>
          <div className="brand-text">
            LUDO <span>ARENA</span>
          </div>
          <span className="brand-badge">MULTIPLAYER</span>
        </div>

        <div className="app-user-bar">
          <div className="user-profile-badge">
            <div className="user-avatar-circle">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <span className="user-name-text">{user.name}</span>
          </div>

          <div>
            {wsConnected ? (
              <span className="connection-pill online">
                <Wifi style={{ width: 13, height: 13 }} /> Live
              </span>
            ) : (
              <span className="connection-pill offline">
                <WifiOff style={{ width: 13, height: 13 }} /> Disconnected
              </span>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="icon-button"
            title="Sign Out"
          >
            <LogOut style={{ width: 16, height: 16 }} />
          </button>
        </div>
      </header>

      {/* Toast Alert */}
      {toastMessage && <div className="toast-banner">{toastMessage}</div>}

      {/* Admin Kick Alert Modal */}
      {inactiveAlert && isHost && (
        <AdminKickModal
          playerName={inactiveAlert.name}
          userId={inactiveAlert.userId}
          missedCount={inactiveAlert.missedCount}
          onKick={handleKickPlayer}
          onDismiss={() => setInactiveAlert(null)}
        />
      )}

      {/* Game Over Modal */}
      {gameState?.status === "COMPLETED" && (
        <GameOverModal
          winnerId={gameState.winnerId!}
          rankings={gameState.rankings}
          players={gameState.players}
          onPlayAgain={() => {
            setGameState(null);
            setRoomId(null);
          }}
        />
      )}

      {/* MAIN CONTENT: LOBBY OR LIVE BOARD */}
      <main className="app-main">
        {!gameState || gameState.status === "WAITING" ? (
          <Lobby
            user={user}
            token={token}
            onEnterGame={(id, hostRole) => {
              setRoomId(id);
              setIsHost(hostRole);
            }}
            waitingRoomId={roomId}
            setWaitingRoomId={setRoomId}
            connectedPlayerCount={connectedPlayerCount}
            maxPlayersSetting={roomMaxPlayers}
            lobbyPlayers={lobbyPlayers}
            onStartGame={handleStartGame}
            isHost={isHost}
          />
        ) : (
          /* LIVE GAME ARENA */
          <div className="arena-grid">
            {/* Left Column: Player Cards */}
            <div className="arena-col-players">
              {gameState.players.map((p) => (
                <PlayerCard
                  key={p.userId}
                  player={p}
                  isCurrentTurn={gameState.currentTurnUserId === p.userId}
                  isHost={isHost}
                  isSelf={p.userId === user.id}
                />
              ))}
            </div>

            {/* Center Column: 15x15 Ludo Board */}
            <div className="arena-col-board">
              <TurnTimer
                currentTurnUserId={gameState.currentTurnUserId}
                turnPhase={gameState.turnPhase}
                lastUpdated={gameState.lastUpdated}
              />

              <LudoBoard
                players={gameState.players}
                movableTokenIds={gameState.movableTokenIds}
                isMyTurn={isMyTurn}
                onMoveToken={handleMoveToken}
                myUserId={user.id}
                boardType={gameState.boardType}
              />
            </div>

            {/* Right Column: Dice Roll & Actions */}
            <div className="arena-col-actions">
              <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
                <span
                  style={{
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 800,
                    color: "#94a3b8",
                  }}
                >
                  Current Turn
                </span>
                <h3
                  className="font-heading"
                  style={{
                    fontSize: "1.25rem",
                    fontWeight: 800,
                    color: "#ffffff",
                    marginTop: "0.25rem",
                  }}
                >
                  {isMyTurn ? "Your Turn!" : `${currentPlayer?.name || "Player"}'s Turn`}
                </h3>
              </div>

              <Dice
                value={gameState.currentDice}
                isRolling={false}
                disabled={!isMyTurn || gameState.turnPhase !== "ROLL_DICE"}
                onRoll={handleRollDice}
                playerColor={
                  currentPlayer?.color === "RED"
                    ? "#ef4444"
                    : currentPlayer?.color === "GREEN"
                    ? "#10b981"
                    : currentPlayer?.color === "YELLOW"
                    ? "#f59e0b"
                    : currentPlayer?.color === "BLUE"
                    ? "#3b82f6"
                    : currentPlayer?.color === "PURPLE"
                    ? "#8b5cf6"
                    : "#f97316"
                }
              />

              {isMyTurn && gameState.turnPhase === "MOVE_TOKEN" && (
                <div
                  style={{
                    marginTop: "1.25rem",
                    padding: "0.75rem 1rem",
                    borderRadius: "12px",
                    background: "rgba(99, 102, 241, 0.2)",
                    border: "1.5px solid rgba(99, 102, 241, 0.4)",
                    color: "#c7d2fe",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    textAlign: "center",
                  }}
                >
                  ✨ Click a bouncing token on the board to move!
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        Ludo Arena Multiplayer &copy; 2026. Real-time WebSockets & Game Engine.
      </footer>
    </div>
  );
};
