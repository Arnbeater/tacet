'use client';

import React, { useReducer, useRef, useCallback, useEffect } from 'react';
import { DropZone } from '@/components/DropZone';
import { Waveform } from '@/components/Waveform';
import { Controls } from '@/components/Controls';
import { VideoPreview } from '@/components/VideoPreview';
import { OverlayProgress } from '@/components/OverlayProgress';
import {
  detectSilences,
  getKeepSegments,
  totalSilenceDuration,
  DEFAULT_PARAMS,
  type SilenceSegment,
  type SilenceParams,
} from '@/lib/silence';
import { analyzeAudio, formatTime } from '@/lib/audio';
import { extractAudio, exportVideo, loadFFmpeg } from '@/lib/ffmpeg';

// ─── State machine ────────────────────────────────────────────────────────────

interface ReadyData {
  file: File;
  videoUrl: string;
  peaks: Float32Array;
  rmsDb: Float32Array;
  bucketDuration: number;
  duration: number;
  silences: SilenceSegment[];
}

type AppState =
  | { phase: 'idle' }
  | { phase: 'loading'; title: string; status: string }
  | { phase: 'ready'; data: ReadyData }
  | { phase: 'exporting'; data: ReadyData; progress: number }
  | { phase: 'error'; message: string };

type Action =
  | { type: 'LOAD_START'; title: string; status: string }
  | { type: 'LOAD_READY'; data: ReadyData }
  | { type: 'LOAD_ERROR'; message: string }
  | { type: 'UPDATE_SILENCES'; silences: SilenceSegment[] }
  | { type: 'EXPORT_START' }
  | { type: 'EXPORT_PROGRESS'; progress: number }
  | { type: 'EXPORT_DONE' }
  | { type: 'RESET' };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOAD_START':
      return { phase: 'loading', title: action.title, status: action.status };

    case 'LOAD_READY':
      return { phase: 'ready', data: action.data };

    case 'LOAD_ERROR':
      return { phase: 'error', message: action.message };

    case 'UPDATE_SILENCES':
      if (state.phase !== 'ready') return state;
      return { ...state, data: { ...state.data, silences: action.silences } };

    case 'EXPORT_START':
      if (state.phase !== 'ready') return state;
      return { phase: 'exporting', data: state.data, progress: 0 };

    case 'EXPORT_PROGRESS':
      if (state.phase !== 'exporting') return state;
      return { ...state, progress: action.progress };

    case 'EXPORT_DONE':
      if (state.phase !== 'exporting') return state;
      return { phase: 'ready', data: state.data };

    case 'RESET': {
      if (state.phase === 'ready' || state.phase === 'exporting') {
        URL.revokeObjectURL(state.data.videoUrl);
      }
      return { phase: 'idle' };
    }

    default:
      return state;
  }
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function TacetPage() {
  const [state, dispatch] = useReducer(reducer, { phase: 'idle' });
  const paramsRef = useRef<SilenceParams>(DEFAULT_PARAMS);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewModeRef = useRef(false);
  const [previewActive, setPreviewActive] = useToggle(false);
  const [currentTime] = useAnimationTime(videoRef);
  const [errorBanner, setErrorBanner] = useTempState<string | null>(null, 6000);

  // Prefetch ffmpeg on idle
  useEffect(() => {
    loadFFmpeg().catch(() => {
      // Silent — will retry on first file load
    });
  }, []);

  // ── File handling ────────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    dispatch({ type: 'LOAD_START', title: 'Udtrækker lydspor', status: 'Konverterer til PCM for analyse' });

    try {
      const wavData = await extractAudio(file);

      dispatch({ type: 'LOAD_START', title: 'Dekoder audio', status: 'Bygger waveform' });

      const { audioBuffer, peaks, rmsDb, bucketDuration } = await analyzeAudio(wavData);

      const videoUrl = URL.createObjectURL(file);
      const silences = detectSilences(rmsDb, bucketDuration, paramsRef.current);

      dispatch({
        type: 'LOAD_READY',
        data: {
          file,
          videoUrl,
          peaks,
          rmsDb,
          bucketDuration,
          duration: audioBuffer.duration,
          silences,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'LOAD_ERROR', message: msg });
      console.error('[TACET] Load error:', err);
    }
  }, []);

  // ── Param changes ────────────────────────────────────────────────────────────

  const handleParamsChange = useCallback(
    (params: SilenceParams) => {
      paramsRef.current = params;
      if (state.phase !== 'ready') return;
      const { rmsDb, bucketDuration } = state.data;
      const silences = detectSilences(rmsDb, bucketDuration, params);
      dispatch({ type: 'UPDATE_SILENCES', silences });
    },
    [state],
  );

  // ── Preview ──────────────────────────────────────────────────────────────────

  const handlePreviewToggle = useCallback(() => {
    if (state.phase !== 'ready') return;
    const next = !previewActive;
    setPreviewActive(next);
    previewModeRef.current = next;
    const video = videoRef.current;
    if (!video) return;
    if (next) {
      video.currentTime = 0;
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [state.phase, previewActive, setPreviewActive]);

  // Skip silence during preview
  useEffect(() => {
    const video = videoRef.current;
    if (!video || state.phase !== 'ready') return;

    const { silences } = state.data;

    const onTimeUpdate = () => {
      if (!previewModeRef.current) return;
      const t = video.currentTime;
      const hit = silences.find((s) => t >= s.start && t < s.end - 0.05);
      if (hit) video.currentTime = hit.end;
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    return () => video.removeEventListener('timeupdate', onTimeUpdate);
  }, [state]);

  // ── Export ───────────────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    if (state.phase !== 'ready') return;
    const { data } = state;

    if (data.silences.length === 0) {
      setErrorBanner('Ingen stilheder fundet — juster threshold eller vælg en ny fil');
      return;
    }

    const keepSegments = getKeepSegments(data.silences, data.duration);
    if (keepSegments.length === 0) {
      setErrorBanner('Hele videoen er markeret som stilhed — hæv threshold');
      return;
    }

    dispatch({ type: 'EXPORT_START' });

    try {
      const blob = await exportVideo(data.file, keepSegments, (pct) => {
        dispatch({ type: 'EXPORT_PROGRESS', progress: pct });
      });

      const url = URL.createObjectURL(blob);
      const base = data.file.name.replace(/\.[^.]+$/, '');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${base}.tacet.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      dispatch({ type: 'EXPORT_DONE' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      dispatch({ type: 'EXPORT_DONE' });
      setErrorBanner(`Eksport fejlede: ${msg}`);
      console.error('[TACET] Export error:', err);
    }
  }, [state, setErrorBanner]);

  // ── Derived values ───────────────────────────────────────────────────────────

  const readyData = state.phase === 'ready' || state.phase === 'exporting' ? state.data : null;
  const totalSaved = readyData ? totalSilenceDuration(readyData.silences) : 0;
  const savedPct =
    readyData && readyData.duration > 0
      ? ((totalSaved / readyData.duration) * 100).toFixed(0)
      : '0';

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Loading overlay */}
      <OverlayProgress
        visible={state.phase === 'loading'}
        title={state.phase === 'loading' ? state.title : ''}
        status={state.phase === 'loading' ? state.status : ''}
        progress={null}
      />

      {/* Export overlay */}
      <OverlayProgress
        visible={state.phase === 'exporting'}
        title="Eksporterer video"
        status={
          state.phase === 'exporting'
            ? `${state.progress}% · ${readyData ? getKeepSegments(readyData.silences, readyData.duration).length : 0} segmenter`
            : ''
        }
        progress={state.phase === 'exporting' ? state.progress : null}
      />

      {/* Header */}
      <header className="px-14 py-12 pb-8 border-b border-[#28251e] flex justify-between items-end relative z-[2]">
        <div className="font-display text-5xl font-medium tracking-[0.28em] text-[#e8e2d4]">
          TACET
          <em className="not-italic font-normal tracking-[0.08em] text-[#c8a55b] ml-1">
            · auto-editor
          </em>
        </div>
        <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-[#8a8272] text-right leading-[1.8]">
          Silentium ex rumore
          <span className="inline-block w-10 h-px bg-[#7a6638] align-middle mx-2.5" aria-hidden="true" />
          MMXXVI
          <br />
          Talking-head · Tutorial · Voice-over
        </div>
      </header>

      <main className="max-width-7xl mx-auto px-14 py-14 relative z-[2]">
        {/* Error banner */}
        {errorBanner && (
          <div role="alert" className="mb-5 p-4 border border-[#7a3a2e] text-[#7a3a2e] font-mono text-xs">
            ⚠ {errorBanner}
          </div>
        )}

        {/* Error state */}
        {state.phase === 'error' && (
          <div role="alert" className="mb-5 p-4 border border-[#7a3a2e] text-[#7a3a2e] font-mono text-xs">
            ⚠ {state.message}
            <button
              className="ml-4 underline"
              onClick={() => dispatch({ type: 'RESET' })}
            >
              Prøv igen
            </button>
          </div>
        )}

        {/* Drop zone */}
        {state.phase === 'idle' || state.phase === 'error' ? (
          <DropZone onFile={handleFile} />
        ) : null}

        {/* Workspace */}
        {readyData && (
          <div>
            {/* Meta bar */}
            <div className="flex justify-between items-center py-4 border-b border-[#28251e] font-mono text-[11px] tracking-[0.15em] text-[#8a8272] uppercase">
              <span className="text-[#e8e2d4] tracking-[0.05em] normal-case text-[13px]">
                {readyData.file.name}
                <span className="text-[#8a8272] ml-2 text-xs">
                  · {(readyData.file.size / 1024 / 1024).toFixed(1)} MB
                </span>
              </span>
              <div className="flex gap-6">
                <span>
                  Varighed{' '}
                  <strong className="text-[#c8a55b] font-normal">
                    {formatTime(readyData.duration)}
                  </strong>
                </span>
                <span>
                  Stilheder{' '}
                  <strong className="text-[#c8a55b] font-normal">{readyData.silences.length}</strong>
                </span>
                <span>
                  Besparelse{' '}
                  <strong className="text-[#c8a55b] font-normal">
                    {formatTime(totalSaved)} · {savedPct}%
                  </strong>
                </span>
              </div>
            </div>

            {/* Stage: video + waveform */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-8 my-10">
              <VideoPreview ref={videoRef} src={readyData.videoUrl} />

              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-baseline font-mono text-[10px] tracking-[0.25em] uppercase text-[#8a8272]">
                  <span>Lydspor · waveform</span>
                  <strong className="text-[#c8a55b] font-normal">
                    {formatTime(currentTime)} / {formatTime(readyData.duration)}
                  </strong>
                </div>

                <Waveform
                  peaks={readyData.peaks}
                  duration={readyData.duration}
                  silences={readyData.silences}
                  threshold={paramsRef.current.threshold}
                  currentTime={currentTime}
                  onSeek={(t) => {
                    if (videoRef.current) videoRef.current.currentTime = t;
                  }}
                />

                <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#8a8272]">
                  <strong className="text-[#c8a55b] font-normal">
                    {readyData.silences.length}
                  </strong>{' '}
                  stilheder ·{' '}
                  <strong className="text-[#c8a55b] font-normal">{formatTime(totalSaved)}</strong>{' '}
                  fjernes · output →{' '}
                  <strong className="text-[#c8a55b] font-normal">
                    {formatTime(readyData.duration - totalSaved)}
                  </strong>
                </p>
              </div>
            </div>

            {/* Controls */}
            <Controls
              params={paramsRef.current}
              onChange={handleParamsChange}
            />

            {/* Actions */}
            <div className="flex justify-between items-center gap-6 mt-8">
              <div className="flex gap-3">
                <button
                  className={[
                    'font-mono text-[11px] tracking-[0.25em] uppercase px-7 py-3.5 border cursor-pointer',
                    'transition-all duration-300',
                    previewActive
                      ? 'bg-[#c8a55b] text-[#0d0c0a] border-[#c8a55b]'
                      : 'bg-transparent text-[#e8e2d4] border-[#3d392f] hover:border-[#c8a55b] hover:text-[#c8a55b]',
                  ].join(' ')}
                  onClick={handlePreviewToggle}
                >
                  {previewActive ? '■ Stop preview' : '▸ Preview med klip'}
                </button>

                <button
                  className="font-mono text-[11px] tracking-[0.25em] uppercase px-4 py-3.5 border border-transparent text-[#8a8272] cursor-pointer transition-all duration-300 hover:text-[#c8a55b]"
                  onClick={() => dispatch({ type: 'RESET' })}
                >
                  Nulstil
                </button>
              </div>

              <button
                className={[
                  'font-mono text-[11px] tracking-[0.25em] uppercase px-7 py-3.5 border cursor-pointer',
                  'transition-all duration-300',
                  readyData.silences.length === 0 || state.phase === 'exporting'
                    ? 'opacity-30 cursor-not-allowed bg-[#c8a55b] text-[#0d0c0a] border-[#c8a55b]'
                    : 'bg-[#c8a55b] text-[#0d0c0a] border-[#c8a55b] hover:bg-transparent hover:text-[#c8a55b]',
                ].join(' ')}
                onClick={handleExport}
                disabled={readyData.silences.length === 0 || state.phase === 'exporting'}
                aria-label="Eksportér klippet video"
              >
                Eksportér klippet video
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="px-14 py-10 border-t border-[#28251e] font-mono text-[10px] tracking-[0.2em] uppercase text-[#3d392f] flex justify-between relative z-[2]">
        <span>TACET · Local-only · ffmpeg.wasm</span>
        <span>Ordo Mensorum</span>
      </footer>
    </>
  );
}

// ─── Hooks ─────────────────────────────────────────────────────────────────────

function useToggle(initial: boolean): [boolean, (v: boolean) => void] {
  const [val, setVal] = useReducer((_: boolean, next: boolean) => next, initial);
  return [val, setVal];
}

function useAnimationTime(ref: React.RefObject<HTMLVideoElement>): [number, () => void] {
  const [time, setTime] = useReducer((_: number, next: number) => next, 0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const tick = () => {
      setTime(video.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };

    const onPlay = () => { rafRef.current = requestAnimationFrame(tick); };
    const onPause = () => { cancelAnimationFrame(rafRef.current); };
    const onSeeked = () => { setTime(video.currentTime); };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', onSeeked);

    return () => {
      cancelAnimationFrame(rafRef.current);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', onSeeked);
    };
  }, [ref]);

  return [time, () => setTime(0)];
}

function useTempState<T>(initial: T, durationMs: number): [T, (v: T) => void] {
  const [val, setVal] = useReducer((_: T, next: T) => next, initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = useCallback(
    (next: T) => {
      setVal(next);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setVal(initial), durationMs);
    },
    [initial, durationMs],
  );

  return [val, set];
}
