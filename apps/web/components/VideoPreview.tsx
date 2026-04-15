'use client';

import { forwardRef } from 'react';

interface VideoPreviewProps {
  src: string;
}

export const VideoPreview = forwardRef<HTMLVideoElement, VideoPreviewProps>(
  function VideoPreview({ src }, ref) {
    return (
      <div className="relative bg-black border border-[#28251e] aspect-video overflow-hidden">
        <div
          className="absolute top-3 left-3 z-10 font-mono text-[10px] tracking-[0.2em] uppercase text-[#c8a55b] bg-black/60 px-2 py-1"
          aria-hidden="true"
        >
          Preview
        </div>
        <video
          ref={ref}
          src={src}
          controls
          className="w-full h-full object-contain bg-black"
          preload="metadata"
        />
        {/* Inset shadow overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ boxShadow: 'inset 0 0 80px rgba(0,0,0,0.6)' }}
          aria-hidden="true"
        />
      </div>
    );
  },
);
