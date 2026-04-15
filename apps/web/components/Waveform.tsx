'use client';

import { useRef, useEffect, useCallback } from 'react';
import type { SilenceSegment } from '@/lib/silence';
import { formatTime } from '@/lib/audio';

interface WaveformProps {
  peaks: Float32Array;
  duration: number;
  silences: SilenceSegment[];
  threshold: number;
  currentTime: number;
  onSeek: (time: number) => void;
}

export function Waveform({
  peaks,
  duration,
  silences,
  threshold,
  currentTime,
  onSeek,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0) return;

    const dpr = window.devicePixelRatio;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    if (w === 0 || h === 0) return;

    canvas.width = w * dpr;
    canvas.height = h * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const pxPerSec = w / duration;
    const mid = h / 2;

    // Time grid
    const gridStep = duration > 120 ? 30 : duration > 30 ? 10 : 5;
    ctx.strokeStyle = 'rgba(61, 57, 47, 0.4)';
    ctx.lineWidth = 1;
    for (let t = gridStep; t < duration; t += gridStep) {
      const x = t * pxPerSec;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.fillStyle = 'rgba(138, 130, 114, 0.5)';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText(formatTime(t), x + 4, 12);
    }

    // Silence background regions
    ctx.fillStyle = 'rgba(122, 58, 46, 0.25)';
    for (const s of silences) {
      ctx.fillRect(s.start * pxPerSec, 0, (s.end - s.start) * pxPerSec, h);
    }

    // Silence edge bars (top + bottom)
    ctx.fillStyle = 'rgba(200, 80, 60, 0.7)';
    for (const s of silences) {
      const x = s.start * pxPerSec;
      const sw = (s.end - s.start) * pxPerSec;
      ctx.fillRect(x, 0, sw, 2);
      ctx.fillRect(x, h - 2, sw, 2);
    }

    // Waveform peaks
    const bucketPx = w / peaks.length;
    ctx.fillStyle = 'rgba(74, 104, 80, 0.85)';
    for (let i = 0; i < peaks.length; i++) {
      const amp = peaks[i] * (h * 0.45);
      ctx.fillRect(i * bucketPx, mid - amp, Math.max(bucketPx, 1), amp * 2);
    }

    // Threshold dashed lines
    const threshAmp = Math.pow(10, threshold / 20);
    const threshY = threshAmp * (h * 0.45);
    ctx.strokeStyle = 'rgba(200, 165, 91, 0.5)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid - threshY);
    ctx.lineTo(w, mid - threshY);
    ctx.moveTo(0, mid + threshY);
    ctx.lineTo(w, mid + threshY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center baseline
    ctx.strokeStyle = 'rgba(61, 57, 47, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();
  }, [peaks, duration, silences, threshold]);

  // Redraw when data or params change
  useEffect(() => {
    draw();
  }, [draw]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => draw());
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(pct * duration, duration)));
  };

  const playheadPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-h-[200px] bg-[#14130f] border border-[#28251e] overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-crosshair"
        style={{ width: '100%', height: '100%' }}
        onClick={handleClick}
        aria-label="Waveform — klik for at søge"
      />
      <div
        aria-hidden="true"
        className="absolute top-0 bottom-0 w-px pointer-events-none z-10"
        style={{
          left: `${playheadPct}%`,
          background: '#c8a55b',
          boxShadow: '0 0 8px #c8a55b',
          display: currentTime > 0 ? 'block' : 'none',
        }}
      />
    </div>
  );
}
