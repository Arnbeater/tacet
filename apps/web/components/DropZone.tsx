'use client';

import { useRef, useState, useCallback } from 'react';

const ACCEPTED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/x-msvideo'];
const MAX_BROWSER_SIZE_GB = 1.5;

interface DropZoneProps {
  onFile: (file: File) => void;
}

export function DropZone({ onFile }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [sizeWarning, setSizeWarning] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('video/') && !ACCEPTED_TYPES.includes(file.type)) {
        setSizeWarning('Kun videofiler understøttes (mp4, mov, webm, mkv, avi)');
        return;
      }

      const sizeGb = file.size / (1024 * 1024 * 1024);
      if (sizeGb > MAX_BROWSER_SIZE_GB) {
        setSizeWarning(
          `Filen er ${sizeGb.toFixed(1)} GB — over browsergrænsen på ${MAX_BROWSER_SIZE_GB} GB. ` +
            `Brug CLI i stedet: python apps/cli/tacet.py "${file.name}"`,
        );
        return;
      }

      setSizeWarning(null);
      onFile(file);
    },
    [onFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop zone — træk video hertil eller klik for at vælge"
        className={[
          'border border-dashed border-[#3d392f] p-20 text-center cursor-pointer',
          'transition-all duration-300',
          'bg-gradient-to-b from-white/[0.01] to-transparent',
          isDragging
            ? 'border-[#c8a55b] bg-[rgba(200,165,91,0.04)]'
            : 'hover:border-[#c8a55b] hover:bg-[rgba(200,165,91,0.04)]',
        ].join(' ')}
        onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        <div className="font-display italic text-8xl text-[#7a6638] leading-none mb-6 select-none">
          §
        </div>
        <h2 className="font-display font-medium text-3xl tracking-wide mb-3 text-[#e8e2d4]">
          Træk en video hertil
        </h2>
        <p className="font-mono text-xs tracking-[0.2em] uppercase text-[#8a8272]">
          Eller klik for at vælge · mp4 · mov · webm · alt kører lokalt i din browser
        </p>
      </div>

      {sizeWarning && (
        <div
          role="alert"
          className="mt-4 p-4 border border-[#7a3a2e] text-[#7a3a2e] font-mono text-xs"
        >
          ⚠ {sizeWarning}
        </div>
      )}
    </div>
  );
}
