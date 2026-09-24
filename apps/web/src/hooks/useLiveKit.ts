import { useEffect, useRef, useState, useCallback, useSyncExternalStore } from "react";
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

// ---- Media Store (lives outside React render cycle) ----
// This store holds all participant media state in a mutable ref-like object.
// React components subscribe to it via useSyncExternalStore, which only triggers
// a re-render when the snapshot reference actually changes for that component.

type MediaListener = () => void;

class MediaStore {
  private listeners = new Set<MediaListener>();
  private map: Record<string, ParticipantMediaInfo> = {};
  private speakingSet = new Set<string>();
  private snapshotVersion = 0;
  // Frozen snapshot for useSyncExternalStore — only recreated when data changes
  private snapshot: Record<string, ParticipantMediaInfo> = {};

  subscribe = (listener: MediaListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Record<string, ParticipantMediaInfo> => {
    return this.snapshot;
  };

  private notify() {
    this.snapshotVersion++;
    // Create a new frozen snapshot reference so useSyncExternalStore detects the change
    this.snapshot = { ...this.map };
    this.listeners.forEach((l) => l());
  }

  /** Full re-index of all participants from the Room object */
  syncFromRoom(room: Room) {
    const newMap: Record<string, ParticipantMediaInfo> = {};

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

      newMap[local.identity] = {
        identity: local.identity,
        isSpeaking: this.speakingSet.has(local.identity),
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

      newMap[p.identity] = {
        identity: p.identity,
        isSpeaking: this.speakingSet.has(p.identity),
        isMicOn: remoteMicOn,
        isCameraOn: remoteCameraOn,
        videoTrack: remoteVideoTrack,
      };
    });

    // Check if anything actually changed to avoid unnecessary notifications
    if (this.hasMediaChanged(newMap)) {
      this.map = newMap;
      this.notify();
    }
  }

  /** Update only speaking state — very lightweight, no track re-sync */
  updateSpeakers(speakers: Participant[]) {
    const newSpeaking = new Set(speakers.map((s) => s.identity));

    // Check if speaking set actually changed
    if (this.setsEqual(this.speakingSet, newSpeaking)) return;

    this.speakingSet = newSpeaking;

    // Update isSpeaking in the map entries WITHOUT changing track references
    let changed = false;
    for (const [id, info] of Object.entries(this.map)) {
      const shouldBeSpeaking = newSpeaking.has(id);
      if (info.isSpeaking !== shouldBeSpeaking) {
        // Mutate in place to preserve track reference stability
        this.map[id] = { ...info, isSpeaking: shouldBeSpeaking };
        changed = true;
      }
    }

    if (changed) {
      this.notify();
    }
  }

  clear() {
    this.map = {};
    this.speakingSet.clear();
    this.notify();
  }

  getParticipant(userId: string): ParticipantMediaInfo {
    const info = this.map[userId];
    if (info) return info;
    return {
      identity: userId,
      isSpeaking: false,
      isMicOn: false,
      isCameraOn: false,
      videoTrack: null,
    };
  }

  private setsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const item of a) {
      if (!b.has(item)) return false;
    }
    return true;
  }

  /** Check if media-relevant properties changed (tracks, mic, camera) */
  private hasMediaChanged(newMap: Record<string, ParticipantMediaInfo>): boolean {
    const oldKeys = Object.keys(this.map);
    const newKeys = Object.keys(newMap);
    if (oldKeys.length !== newKeys.length) return true;

    for (const key of newKeys) {
      const oldInfo = this.map[key];
      const newInfo = newMap[key];
      if (!oldInfo) return true;
      if (
        oldInfo.videoTrack !== newInfo.videoTrack ||
        oldInfo.isMicOn !== newInfo.isMicOn ||
        oldInfo.isCameraOn !== newInfo.isCameraOn
      ) {
        return true;
      }
    }
    return false;
  }
}

export interface UseLiveKitReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  toggleMicrophone: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  /** Stable function reference — safe to pass as prop without causing re-renders */
  getParticipantMedia: (userId: string) => ParticipantMediaInfo;
  /** Subscribe to media store for reactive updates (used by useParticipantMedia hook) */
  mediaStore: MediaStore;
}

// Singleton media store — lives for the lifetime of the app
const globalMediaStore = new MediaStore();

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

  const roomRef = useRef<Room | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const activeRoomIdRef = useRef<string | null>(null);
  const isConnectingRef = useRef<boolean>(false);

  // Stable function reference that reads from the store — NEVER changes identity
  const getParticipantMedia = useCallback((userId: string): ParticipantMediaInfo => {
    return globalMediaStore.getParticipant(userId);
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
      globalMediaStore.clear();
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
            globalMediaStore.syncFromRoom(room);
          })
          .on(RoomEvent.Disconnected, () => {
            if (isCancelled) return;
            setIsConnected(false);
            setIsConnecting(false);
            setIsMicEnabled(false);
            setIsCameraEnabled(false);
            globalMediaStore.clear();
          })
          .on(RoomEvent.Reconnecting, () => {
            setIsConnecting(true);
          })
          .on(RoomEvent.Reconnected, () => {
            setIsConnecting(false);
            setIsConnected(true);
            globalMediaStore.syncFromRoom(room);
          })
          .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            if (isCancelled) return;
            // Only update speaking flags — does NOT trigger React re-render in App
            globalMediaStore.updateSpeakers(speakers);
          })
          .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication, participant) => {
            if (track.kind === Track.Kind.Audio) {
              const audioEl = (track as RemoteAudioTrack).attach();
              audioEl.id = `lk-audio-${participant.identity}`;
              audioElementsRef.current.set(participant.identity, audioEl);
              document.body.appendChild(audioEl);
            }
            globalMediaStore.syncFromRoom(room);
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
            globalMediaStore.syncFromRoom(room);
          })
          .on(RoomEvent.TrackMuted, () => {
            globalMediaStore.syncFromRoom(room);
          })
          .on(RoomEvent.TrackUnmuted, () => {
            globalMediaStore.syncFromRoom(room);
          })
          .on(RoomEvent.ParticipantConnected, () => {
            globalMediaStore.syncFromRoom(room);
          })
          .on(RoomEvent.ParticipantDisconnected, (participant) => {
            const existing = audioElementsRef.current.get(participant.identity);
            if (existing && existing.parentNode) {
              existing.parentNode.removeChild(existing);
            }
            audioElementsRef.current.delete(participant.identity);
            globalMediaStore.syncFromRoom(room);
          })
          .on(RoomEvent.LocalTrackPublished, () => {
            globalMediaStore.syncFromRoom(room);
          })
          .on(RoomEvent.LocalTrackUnpublished, () => {
            globalMediaStore.syncFromRoom(room);
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
        globalMediaStore.syncFromRoom(room);
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
  }, [roomId, authToken, enabled]);

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
      globalMediaStore.syncFromRoom(room);
    } catch (err: unknown) {
      console.error("Microphone toggle error:", err);
      const msg = err instanceof Error ? err.message : "Could not toggle microphone";
      setError(msg);
    }
  }, [isMicEnabled]);

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
      globalMediaStore.syncFromRoom(room);
    } catch (err: unknown) {
      console.error("Camera toggle error:", err);
      const msg = err instanceof Error ? err.message : "Could not toggle camera";
      setError(msg);
    }
  }, [isCameraEnabled]);

  return {
    isConnected,
    isConnecting,
    error,
    isMicEnabled,
    isCameraEnabled,
    toggleMicrophone,
    toggleCamera,
    getParticipantMedia,
    mediaStore: globalMediaStore,
  };
}

// ---- Hook for components that need to reactively display participant media ----
// This hook subscribes to the MediaStore and only re-renders the component
// when the specific participant's media info actually changes.

export function useParticipantMedia(userId: string): ParticipantMediaInfo {
  const snapshotRef = useRef<ParticipantMediaInfo>({
    identity: userId,
    isSpeaking: false,
    isMicOn: false,
    isCameraOn: false,
    videoTrack: null,
  });

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return globalMediaStore.subscribe(() => {
        const next = globalMediaStore.getParticipant(userId);
        const prev = snapshotRef.current;
        // Only notify React if something actually changed for THIS participant
        if (
          prev.videoTrack !== next.videoTrack ||
          prev.isCameraOn !== next.isCameraOn ||
          prev.isMicOn !== next.isMicOn ||
          prev.isSpeaking !== next.isSpeaking
        ) {
          snapshotRef.current = next;
          onStoreChange();
        }
      });
    },
    [userId]
  );

  const getSnapshot = useCallback(() => {
    return snapshotRef.current;
  }, []);

  // Initialize on first call
  const initial = globalMediaStore.getParticipant(userId);
  if (snapshotRef.current.videoTrack !== initial.videoTrack ||
      snapshotRef.current.isCameraOn !== initial.isCameraOn ||
      snapshotRef.current.isMicOn !== initial.isMicOn) {
    snapshotRef.current = initial;
  }

  return useSyncExternalStore(subscribe, getSnapshot);
}
