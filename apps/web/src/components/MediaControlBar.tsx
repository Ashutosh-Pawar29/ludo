import React from "react";
import { Mic, MicOff, Video, VideoOff, Radio, AlertCircle } from "lucide-react";

interface MediaControlBarProps {
  isConnected: boolean;
  isConnecting: boolean;
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  toggleMicrophone: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  error?: string | null;
}

export const MediaControlBar: React.FC<MediaControlBarProps> = ({
  isConnected,
  isConnecting,
  isMicEnabled,
  isCameraEnabled,
  toggleMicrophone,
  toggleCamera,
  error,
}) => {
  return (
    <div className="media-control-bar-wrapper">
      <div className="media-control-bar glass-panel">
        {/* Status Indicator */}
        <div className="media-status-pill">
          {isConnected ? (
            <>
              <span className="live-status-dot online" />
              <span className="media-status-text">Voice & Video Live</span>
            </>
          ) : isConnecting ? (
            <>
              <span className="live-status-dot connecting" />
              <span className="media-status-text">Connecting SFU...</span>
            </>
          ) : (
            <>
              <Radio size={14} color="#94a3b8" />
              <span className="media-status-text" style={{ color: "#94a3b8" }}>
                Voice/Video Standby
              </span>
            </>
          )}
        </div>

        <div className="media-buttons-group">
          {/* Microphone Toggle */}
          <button
            onClick={toggleMicrophone}
            disabled={!isConnected}
            className={`media-btn ${isMicEnabled ? "active-mic" : "inactive-mic"}`}
            title={
              !isConnected
                ? "Connecting to LiveKit..."
                : isMicEnabled
                ? "Click to Mute Microphone"
                : "Click to Unmute Microphone"
            }
          >
            {isMicEnabled ? <Mic size={20} /> : <MicOff size={20} />}
            <span className="media-btn-label">
              {isMicEnabled ? "Mic ON" : "Mic OFF"}
            </span>
          </button>

          {/* Camera Toggle */}
          <button
            onClick={toggleCamera}
            disabled={!isConnected}
            className={`media-btn ${isCameraEnabled ? "active-cam" : "inactive-cam"}`}
            title={
              !isConnected
                ? "Connecting to LiveKit..."
                : isCameraEnabled
                ? "Click to Turn Off Camera"
                : "Click to Turn On Camera"
            }
          >
            {isCameraEnabled ? <Video size={20} /> : <VideoOff size={20} />}
            <span className="media-btn-label">
              {isCameraEnabled ? "Video ON" : "Video OFF"}
            </span>
          </button>
        </div>

        {error && (
          <div className="media-error-badge" title={error}>
            <AlertCircle size={14} color="#f87171" />
            <span style={{ fontSize: "0.75rem", color: "#fca5a5" }}>
              SFU Notice
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
