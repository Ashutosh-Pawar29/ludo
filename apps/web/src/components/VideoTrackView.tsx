import React, { useEffect, useRef } from "react";
import type { Track } from "livekit-client";

interface VideoTrackViewProps {
  track: Track | null;
  isSelf?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const VideoTrackView: React.FC<VideoTrackViewProps> = ({
  track,
  isSelf = false,
  className = "",
  style = {},
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !track) return;

    track.attach(el);

    return () => {
      track.detach(el);
    };
  }, [track]);

  if (!track) return null;

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={isSelf} // mute self to avoid echo
      className={className}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        borderRadius: "inherit",
        transform: isSelf ? "scaleX(-1)" : undefined, // Mirror local camera preview
        ...style,
      }}
    />
  );
};
