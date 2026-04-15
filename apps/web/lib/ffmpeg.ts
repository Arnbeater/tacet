'use client';

import type { FFmpeg } from '@ffmpeg/ffmpeg';
import type { SilenceSegment } from './silence';

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.isLoaded()) return ffmpegInstance;

  if (!loadPromise) {
    // Dynamic import to ensure client-only
    const { createFFmpeg } = await import('@ffmpeg/ffmpeg');
    ffmpegInstance = createFFmpeg({
      log: false,
      corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
    });
    loadPromise = ffmpegInstance.load();
  }

  await loadPromise;

  if (!ffmpegInstance) {
    throw new Error('ffmpeg failed to initialize');
  }

  return ffmpegInstance;
}

export async function loadFFmpeg(): Promise<void> {
  await getFFmpeg();
}

export async function extractAudio(file: File): Promise<Uint8Array> {
  const ff = await getFFmpeg();
  const { fetchFile } = await import('@ffmpeg/ffmpeg');

  const ext = file.name.split('.').pop() ?? 'mp4';
  const inputName = `input.${ext}`;

  ff.FS('writeFile', inputName, await fetchFile(file));

  // Extract mono 16kHz WAV — fast analysis, small footprint
  await ff.run('-i', inputName, '-ac', '1', '-ar', '16000', '-vn', 'analysis.wav');

  const data = ff.FS('readFile', 'analysis.wav');

  ff.FS('unlink', inputName);
  ff.FS('unlink', 'analysis.wav');

  return data;
}

export async function exportVideo(
  file: File,
  keepSegments: SilenceSegment[],
  onProgress: (pct: number) => void,
): Promise<Blob> {
  if (keepSegments.length === 0) {
    throw new Error('No segments to keep');
  }

  const ff = await getFFmpeg();
  const { fetchFile } = await import('@ffmpeg/ffmpeg');

  const ext = file.name.split('.').pop() ?? 'mp4';
  const inputName = `input.${ext}`;

  ff.FS('writeFile', inputName, await fetchFile(file));

  ff.setProgress(({ ratio }) => {
    if (ratio >= 0 && ratio <= 1) {
      onProgress(Math.round(ratio * 100));
    }
  });

  // Build filter_complex for trim + concat
  const filterParts: string[] = [];

  keepSegments.forEach((seg, i) => {
    filterParts.push(
      `[0:v]trim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`,
    );
    filterParts.push(
      `[0:a]atrim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`,
    );
  });

  const concatInputs = keepSegments.map((_, i) => `[v${i}][a${i}]`).join('');
  filterParts.push(
    `${concatInputs}concat=n=${keepSegments.length}:v=1:a=1[outv][outa]`,
  );

  const filterComplex = filterParts.join(';');

  await ff.run(
    '-i', inputName,
    '-filter_complex', filterComplex,
    '-map', '[outv]',
    '-map', '[outa]',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    'output.mp4',
  );

  const data = ff.FS('readFile', 'output.mp4');

  ff.FS('unlink', inputName);
  ff.FS('unlink', 'output.mp4');

  return new Blob([data.buffer.slice(0)], { type: 'video/mp4' });
}
