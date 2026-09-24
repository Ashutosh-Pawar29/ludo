import { useEffect, useRef, useState, useCallback } from "react";
import {
  Room,
  RoomEvent,
  Track,
  VideoPresets,
  type RemoteTrack,
  type RemoteAudioTrack,
  type Participant,
} from "livekit-client";
import { getApiUrl, LIVEKIT_SERVER_URL } from "../config";

export interface ParticipantMediaInfo {
  identity: string;
  isSpeaking: boolean;
  isMicOn: boolean;
  isCameraOn: boolean;
  videoTrack: Track | null;
}

export interface UseLiveKitReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  toggleMicrophone: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  speakingUserIds: Set<string>;
  getParticipantMedia: (userId: string) => ParticipantMediaInfo;
  participantMediaMap: Record<string, ParticipantMediaInfo>;
}

export function useLiveKit(
  roomId: string | null,
  authToken: string | null,
  enabled: boolean = true
): UseLiveKitReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);

  const [speakingUserIds, setSpeakingUserIds] = useState<Set<string>>(new Set());
  const [participantMediaMap, setParticipantMediaMap] = useState<
    Record<string, ParticipantMediaInfo>
  >({});

  const roomRef = useRef<Room | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const activeRoomIdRef = useRef<string | null>(null);
  const isConnectingRef = useRef<boolean>(false);

  // Helper to re-index all participants (local and remote) into media map
  const syncParticipants = useCallback((room: Room) => {
    const map: Record<string, ParticipantMediaInfo> = {};

    // Local participant
    const local = room.localParticipant;
    if (local) {
      let localVideoTrack: Track | null = null;
      let localMicOn = false;
      let localCameraOn = false;

      local.videoTrackPublications.forEach((pub) => {
        if (pub.track && !pub.isMuted) {
          localVideoTrack = pub.track;
          localCameraOn = true;
        }
      });

      local.audioTrackPublications.forEach((pub) => {
        if (pub.track && !pub.isMuted) {
          localMicOn = true;
        }
      });

      map[local.identity] = {
        identity: local.identity,
        isSpeaking: local.isSpeaking,
        isMicOn: localMicOn,
        isCameraOn: localCameraOn,
        videoTrack: localVideoTrack,
      };
    }

    // Remote participants
    room.remoteParticipants.forEach((p: Participant) => {
      let remoteVideoTrack: Track | null = null;
      let remoteMicOn = false;
      let remoteCameraOn = false;

      p.videoTrackPublications.forEach((pub) => {
        if (pub.track && !pub.isMuted) {
          remoteVideoTrack = pub.track;
          remoteCameraOn = true;
        }
      });

      p.audioTrackPublications.forEach((pub) => {
        if (pub.track && !pub.isMuted) {
          remoteMicOn = true;
        }
      });

      map[p.identity] = {
        identity: p.identity,
        isSpeaking: p.isSpeaking,
        isMicOn: remoteMicOn,
        isCameraOn: remoteCameraOn,
        videoTrack: remoteVideoTrack,
      };
    });

    setParticipantMediaMap(map);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      audioElementsRef.current.forEach((el) => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
      audioElementsRef.current.clear();
      isConnectingRef.current = false;
    };
  }, []);

  // Connect to LiveKit Room
  useEffect(() => {
    if (!enabled || !roomId || !authToken) {
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      activeRoomIdRef.current = null;
      isConnectingRef.current = false;
      setIsConnected(false);
      setIsConnecting(false);
      setIsMicEnabled(false);
      setIsCameraEnabled(false);
      setParticipantMediaMap({});
      setSpeakingUserIds(new Set());
      return;
    }

    // Avoid redundant reconnect if already in or connecting to this room
    if (
      activeRoomIdRef.current === roomId &&
      roomRef.current &&
      (roomRef.current.state === "connected" ||
        roomRef.current.state === "connecting" ||
        roomRef.current.state === "reconnecting")
    ) {
      return;
    }

    if (isConnectingRef.current && activeRoomIdRef.current === roomId) {
      return;
    }

    let isCancelled = false;
    isConnectingRef.current = true;
    setIsConnecting(true);
    setError(null);
    activeRoomIdRef.current = roomId;

    async function initRoom() {
      try {
        const tokenRes = await fetch(getApiUrl("/api/livekit/token"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            token: authToken as string,
          },
          body: JSON.stringify({ roomId }),
        });

        if (!tokenRes.ok) {
          const errData = await tokenRes.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to fetch LiveKit token");
        }

        const { token: sfuToken, serverUrl } = await tokenRes.json();
        if (isCancelled) return;

        // Disconnect previous room if room changed
        if (roomRef.current && roomRef.current.state === "connected") {
          await roomRef.current.disconnect();
        }

        let wsUrl = serverUrl || LIVEKIT_SERVER_URL;
        if (!wsUrl) {
          wsUrl = window.location.protocol === "https:"
            ? "wss://game-ashu.duckdns.org"
            : `ws://${window.location.hostname}:7880`;
        }

        // If the web app is running over HTTPS (e.g. on Vercel), browsers strictly block
        // insecure ws:// connections. Ensure we use the secure SSL domain on wss://
        if (window.location.protocol === "https:" && (wsUrl.startsWith("ws://") || wsUrl.includes("16.192.187.29"))) {
          wsUrl = "wss://game-ashu.duckdns.org";
        }

        if (wsUrl.includes("localhost") || wsUrl.includes("127.0.0.1")) {
          if (LIVEKIT_SERVER_URL) {
            wsUrl = LIVEKIT_SERVER_URL;
          } else if (!window.location.hostname.includes("vercel.app")) {
            wsUrl = wsUrl
              .replace("localhost", window.location.hostname)
              .replace("127.0.0.1", window.location.hostname);
          }
        }

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          videoCaptureDefaults: {
            resolution: VideoPresets.h540.resolution,
          },
        });
        roomRef.current = room;

        room
          .on(RoomEvent.Connected, () => {
            if (isCancelled) return;
            setIsConnected(true);
            setIsConnecting(false);
            syncParticipants(room);
          })
          .on(RoomEvent.Disconnected, () => {
            if (isCancelled) return;
            setIsConnected(false);
            setIsConnecting(false);
            setIsMicEnabled(false);
            setIsCameraEnabled(false);
            setParticipantMediaMap({});
            setSpeakingUserIds(new Set());
          })
          .on(RoomEvent.Reconnecting, () => {
            setIsConnecting(true);
          })
          .on(RoomEvent.Reconnected, () => {
            setIsConnecting(false);
            setIsConnected(true);
            syncParticipants(room);
          })
          .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            if (isCancelled) return;
            const speaking = new Set(speakers.map((s) => s.identity));
            setSpeakingUserIds(speaking);
            syncParticipants(room);
          })
          .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication, participant) => {
            if (track.kind === Track.Kind.Audio) {
              const audioEl = (track as RemoteAudioTrack).attach();
              audioEl.id = `lk-audio-${participant.identity}`;
              audioElementsRef.current.set(participant.identity, audioEl);
              document.body.appendChild(audioEl);
            }
            syncParticipants(room);
          })
          .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication, participant) => {
            if (track.kind === Track.Kind.Audio) {
              track.detach();
              const existing = audioElementsRef.current.get(participant.identity);
              if (existing && existing.parentNode) {
                existing.parentNode.removeChild(existing);
              }
              audioElementsRef.current.delete(participant.identity);
            }
            syncParticipants(room);
          })
          .on(RoomEvent.TrackMuted, () => {
            syncParticipants(room);
          })
          .on(RoomEvent.TrackUnmuted, () => {
            syncParticipants(room);
          })
          .on(RoomEvent.ParticipantConnected, () => {
            syncParticipants(room);
          })
          .on(RoomEvent.ParticipantDisconnected, (participant) => {
            const existing = audioElementsRef.current.get(participant.identity);
            if (existing && existing.parentNode) {
              existing.parentNode.removeChild(existing);
            }
            audioElementsRef.current.delete(participant.identity);
            syncParticipants(room);
          })
          .on(RoomEvent.LocalTrackPublished, () => {
            syncParticipants(room);
          })
          .on(RoomEvent.LocalTrackUnpublished, () => {
            syncParticipants(room);
          });

        await room.connect(wsUrl, sfuToken, {
          autoSubscribe: true,
          rtcConfig: {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.l.google.com:19302" },
              { urls: "stun:stun2.l.google.com:19302" },
            ],
          },
        });

        if (isCancelled) {
          room.disconnect();
          return;
        }

        setIsConnected(true);
        setIsConnecting(false);
        syncParticipants(room);
      } catch (err: unknown) {
        if (isCancelled) return;
        console.error("LiveKit connection error:", err);
        const message = err instanceof Error ? err.message : "LiveKit connection failed";
        setError(message);
        setIsConnecting(false);
        setIsConnected(false);
      } finally {
        isConnectingRef.current = false;
      }
    }

    initRoom();

    return () => {
      isCancelled = true;
    };
  }, [roomId, authToken, enabled, syncParticipants]);

  // Toggle Microphone
  const toggleMicrophone = useCallback(async () => {
    const room = roomRef.current;
    if (!room || room.state !== "connected") {
      setError("Not connected to audio server");
      return;
    }

    try {
      const nextState = !isMicEnabled;
      await room.localParticipant.setMicrophoneEnabled(nextState);
      setIsMicEnabled(nextState);
      syncParticipants(room);
    } catch (err: unknown) {
      console.error("Microphone toggle error:", err);
      const msg = err instanceof Error ? err.message : "Could not toggle microphone";
      setError(msg);
    }
  }, [isMicEnabled, syncParticipants]);

  // Toggle Camera
  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room || room.state !== "connected") {
      setError("Not connected to video server");
      return;
    }

    try {
      const nextState = !isCameraEnabled;
      await room.localParticipant.setCameraEnabled(nextState);
      setIsCameraEnabled(nextState);
      syncParticipants(room);
    } catch (err: unknown) {
      console.error("Camera toggle error:", err);
      const msg = err instanceof Error ? err.message : "Could not toggle camera";
      setError(msg);
    }
  }, [isCameraEnabled, syncParticipants]);

  const getParticipantMedia = useCallback(
    (userId: string): ParticipantMediaInfo => {
      return (
        participantMediaMap[userId] || {
          identity: userId,
          isSpeaking: speakingUserIds.has(userId),
          isMicOn: false,
          isCameraOn: false,
          videoTrack: null,
        }
      );
    },
    [participantMediaMap, speakingUserIds]
  );

  return {
    isConnected,
    isConnecting,
    error,
    isMicEnabled,
    isCameraEnabled,
    toggleMicrophone,
    toggleCamera,
    speakingUserIds,
    getParticipantMedia,
    participantMediaMap,
  };
}
