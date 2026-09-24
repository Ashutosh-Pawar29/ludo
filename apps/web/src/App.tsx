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
import { MediaControlBar } from "./components/MediaControlBar";
import { useLiveKit } from "./hooks/useLiveKit";
import { LogOut, Wifi, WifiOff, ChevronDown, ChevronUp, Copy, Check, Users } from "lucide-react";
import { getApiUrl, getWsUrl } from "./config";

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

  // Mobile dropdown navbar state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobilePlayersOpen, setMobilePlayersOpen] = useState(false);
  const [copiedRoomId, setCopiedRoomId] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  // Close mobile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    if (mobileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [mobileMenuOpen]);

  // LiveKit SFU Voice & Video Chat
  const {
    isConnected: isLiveKitConnected,
    isConnecting: isLiveKitConnecting,
    error: liveKitError,
    isMicEnabled,
    isCameraEnabled,
    toggleMicrophone,
    toggleCamera,
  } = useLiveKit(roomId, token, Boolean(token && roomId));

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

  // Validate session token on startup and fetch fresh user profile
  useEffect(() => {
    if (!token) return;

    fetch(getApiUrl("/api/users/me"), {
      headers: { token },
    })
      .then(async (res) => {
        if (res.status === 401 || res.status === 404) {
          console.warn("Session expired or user deleted, clearing local session");
          handleLogout();
          return null;
        }
        return res.json().catch(() => null);
      })
      .then((data) => {
        if (data?.id) {
          setUser(data);
          localStorage.setItem("ludo_user", JSON.stringify(data));
        } else if (data === "invalid token" || data?.error === "invalid_token" || data?.error === "user_not_found") {
          handleLogout();
        }
      })
      .catch((err) => {
        console.warn("Could not verify session with backend:", err);
      });
  }, [token]);

  // Fallback lobby polling for player count & room info
  useEffect(() => {
    if (!roomId || (gameState && gameState.status !== "WAITING")) return;

    const syncRoom = () => {
      fetch(getApiUrl(`/api/rooms/${roomId}`))
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

    const wsUrl = getWsUrl(token, roomId);

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
      <header className="app-header" ref={headerRef}>
        <div className="app-brand">
          <div className="brand-logo-icon">
            <span style={{ fontSize: "1.1rem" }}>🎲</span>
          </div>
          <div className="brand-text">
            LUDO <span>ARENA</span>
          </div>
          <span className="brand-badge desktop-only">MULTIPLAYER</span>
        </div>

        {/* Desktop User Bar */}
        <div className="app-user-bar desktop-only">
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

        {/* Mobile Dropdown Trigger */}
        <div className="mobile-only">
          <button
            className="mobile-header-trigger"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
          >
            <div className="user-avatar-circle mini">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <span className="mobile-header-username">{user.name}</span>
            <span className={`mobile-status-dot ${wsConnected ? "online" : "offline"}`} />
            {mobileMenuOpen ? (
              <ChevronUp style={{ width: 15, height: 15, color: "#94a3b8" }} />
            ) : (
              <ChevronDown style={{ width: 15, height: 15, color: "#94a3b8" }} />
            )}
          </button>
        </div>

        {/* Mobile Dropdown Menu Drawer */}
        {mobileMenuOpen && (
          <div className="mobile-dropdown-menu">
            <div className="mobile-dropdown-header">
              <div className="mobile-dropdown-user">
                <div className="user-avatar-circle large">
                  {user.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="mobile-user-info">
                  <div className="mobile-user-name">
                    {user.name}
                    {isHost && <span className="host-tag">HOST</span>}
                  </div>
                  <div className="mobile-user-id">ID: {user.id}</div>
                </div>
              </div>
              <div>
                {wsConnected ? (
                  <span className="connection-pill online">
                    <Wifi style={{ width: 12, height: 12 }} /> Live
                  </span>
                ) : (
                  <span className="connection-pill offline">
                    <WifiOff style={{ width: 12, height: 12 }} /> Offline
                  </span>
                )}
              </div>
            </div>

            {roomId && (
              <div className="mobile-dropdown-room">
                <div className="mobile-room-label">Room Code:</div>
                <div className="mobile-room-code-badge">
                  <code>{roomId}</code>
                  <button
                    className="mobile-copy-btn"
                    onClick={() => {
                      navigator.clipboard.writeText(roomId);
                      setCopiedRoomId(true);
                      setTimeout(() => setCopiedRoomId(false), 2000);
                    }}
                  >
                    {copiedRoomId ? (
                      <>
                        <Check size={12} color="#34d399" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy size={12} /> Copy
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            <div className="mobile-dropdown-actions">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="mobile-logout-btn"
              >
                <LogOut style={{ width: 16, height: 16 }} />
                <span>Sign Out / Switch Account</span>
              </button>
            </div>
          </div>
        )}
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
            onLogout={handleLogout}
          />
        ) : (
          /* LIVE GAME ARENA */
          <div className="arena-grid">
            {/* Player Cards: Collapsible summary toggle on mobile, full column on desktop */}
            <div className="arena-col-players">
              {/* Mobile-only Collapsible Header Toggle */}
              <div className="mobile-only mobile-players-toggle-bar">
                <button
                  type="button"
                  className="mobile-players-toggle-btn"
                  onClick={() => setMobilePlayersOpen((prev) => !prev)}
                  aria-expanded={mobilePlayersOpen}
                >
                  <div className="mobile-players-toggle-left">
                    <Users size={15} color="#818cf8" />
                    <span className="mobile-players-toggle-title">
                      Players ({gameState.players.length})
                    </span>
                    <div className="mobile-players-mini-avatars">
                      {gameState.players.map((p) => {
                        return (
                          <span
                            key={p.userId}
                            className={`mobile-mini-avatar-dot dot-${p.color.toLowerCase()}`}
                            title={`${p.name} (${p.color})`}
                          >
                            {p.name.slice(0, 1).toUpperCase()}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mobile-players-toggle-right">
                    <span className="mobile-toggle-hint">
                      {mobilePlayersOpen ? "Hide" : "Show All"}
                    </span>
                    {mobilePlayersOpen ? (
                      <ChevronUp size={15} color="#94a3b8" />
                    ) : (
                      <ChevronDown size={15} color="#94a3b8" />
                    )}
                  </div>
                </button>
              </div>

              {/* Cards Container: Always shown on desktop, toggled on mobile */}
              <div
                className={`players-cards-container ${
                  mobilePlayersOpen ? "mobile-expanded" : "mobile-collapsed"
                }`}
              >
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
              <div className="action-turn-info">
                <span className="action-turn-label">Current Turn</span>
                <h3 className="action-turn-title font-heading">
                  {isMyTurn ? "Your Turn!" : `${currentPlayer?.name || "Player"}'s Turn`}
                </h3>
                {isMyTurn && gameState.turnPhase === "MOVE_TOKEN" && (
                  <div className="action-move-tip">
                    ✨ Click a bouncing token to move!
                  </div>
                )}
              </div>

              <div className="action-dice-wrapper">
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
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating Bottom Media Bar (LiveKit SFU Voice & Video) */}
      {roomId && user && (
        <MediaControlBar
          isConnected={isLiveKitConnected}
          isConnecting={isLiveKitConnecting}
          isMicEnabled={isMicEnabled}
          isCameraEnabled={isCameraEnabled}
          toggleMicrophone={toggleMicrophone}
          toggleCamera={toggleCamera}
          error={liveKitError}
        />
      )}
    </div>
  );
};
