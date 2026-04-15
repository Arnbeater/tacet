'use client';

interface OverlayProgressProps {
  title: string;
  status: string;
  progress: number | null; // null = indeterminate, 0-100 = determinate
  visible: boolean;
}

export function OverlayProgress({ title, status, progress, visible }: OverlayProgressProps) {
  if (!visible) return null;

  const isIndeterminate = progress === null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 bg-[rgba(13,12,10,0.92)] z-50 flex flex-col items-center justify-center gap-8"
      style={{ backdropFilter: 'blur(6px)' }}
    >
      <h3 className="font-display italic font-normal text-3xl text-[#c8a55b] tracking-wide">
        {title}
      </h3>

      <div className="w-[360px] h-px bg-[#3d392f] relative overflow-hidden">
        {isIndeterminate ? (
          <div
            aria-hidden="true"
            className="absolute inset-y-0 w-[30%] bg-[#c8a55b]"
            style={{
              animation: 'tacet-slide 1.6s cubic-bezier(0.4,0,0.6,1) infinite',
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            className="absolute inset-y-0 left-0 bg-[#c8a55b] transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        )}
      </div>

      <p className="font-mono text-[11px] tracking-[0.25em] uppercase text-[#8a8272]">
        {status}
      </p>
    </div>
  );
}
