'use client';

import { useEffect, useRef } from 'react';
import type { SilenceParams } from '@/lib/silence';

interface ControlsProps {
  params: SilenceParams;
  onChange: (params: SilenceParams) => void;
}

interface KnobDef {
  id: keyof SilenceParams;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  decimals: number;
  description: string;
}

const KNOBS: KnobDef[] = [
  {
    id: 'threshold',
    label: 'Threshold',
    min: -60,
    max: -20,
    step: 1,
    unit: 'dB',
    decimals: 0,
    description: 'Lydniveau under dette er stilhed',
  },
  {
    id: 'minLength',
    label: 'Min. længde',
    min: 0.1,
    max: 2.0,
    step: 0.05,
    unit: 'sek',
    decimals: 2,
    description: 'Korte pauser bevares (vejrtrækning)',
  },
  {
    id: 'padding',
    label: 'Padding',
    min: 0,
    max: 0.5,
    step: 0.01,
    unit: 'sek',
    decimals: 2,
    description: 'Buffer omkring tale — undgå for hårde klip',
  },
];

export function Controls({ params, onChange }: ControlsProps) {
  // Debounce: fire onChange 50ms after last slider move
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<SilenceParams>(params);

  const handleChange = (id: keyof SilenceParams, value: number) => {
    const next = { ...pendingRef.current, [id]: value };
    pendingRef.current = next;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(pendingRef.current), 50);
  };

  useEffect(() => {
    pendingRef.current = params;
  }, [params]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-10 py-8 border-t border-b border-[#28251e]">
      {KNOBS.map((knob) => (
        <div key={knob.id} className="flex flex-col">
          <div className="flex justify-between items-baseline mb-3">
            <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-[#8a8272]">
              {knob.label}
            </span>
            <span className="font-display italic text-2xl text-[#c8a55b]">
              {params[knob.id].toFixed(knob.decimals)}
              <span className="font-mono not-italic text-[10px] tracking-[0.15em] text-[#8a8272] ml-1">
                {knob.unit}
              </span>
            </span>
          </div>

          <input
            type="range"
            min={knob.min}
            max={knob.max}
            step={knob.step}
            value={params[knob.id]}
            aria-label={knob.label}
            className="tacet-range"
            onChange={(e) => handleChange(knob.id, parseFloat(e.target.value))}
          />

          <p className="font-display italic text-sm text-[#8a8272] mt-2.5 leading-snug">
            {knob.description}
          </p>
        </div>
      ))}
    </div>
  );
}
