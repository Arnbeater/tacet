/**
 * Silence detection algorithm — must stay in sync with apps/cli/detect.py
 * See packages/shared/algorithm-spec.md for the canonical spec.
 */

export interface SilenceSegment {
  start: number;
  end: number;
}

export interface SilenceParams {
  threshold: number; // dB, e.g. -40
  minLength: number; // seconds, e.g. 0.4
  padding: number;   // seconds, e.g. 0.1
}

export const DEFAULT_PARAMS: SilenceParams = {
  threshold: -40,
  minLength: 0.4,
  padding: 0.1,
};

/**
 * Compute per-bucket RMS in dB using 10ms fixed buckets.
 * This is the canonical bucket size — matches the CLI.
 */
export function computeDetectionBuckets(
  channelData: Float32Array,
  sampleRate: number,
): { rmsDb: Float32Array; bucketDuration: number } {
  const BUCKETS_PER_SECOND = 100; // 10ms buckets
  const samplesPerBucket = Math.floor(sampleRate / BUCKETS_PER_SECOND);
  const bucketCount = Math.floor(channelData.length / samplesPerBucket);
  const bucketDuration = samplesPerBucket / sampleRate;

  const rmsDb = new Float32Array(bucketCount);

  for (let i = 0; i < bucketCount; i++) {
    const start = i * samplesPerBucket;
    const end = start + samplesPerBucket;
    let sumSq = 0;
    for (let j = start; j < end; j++) {
      sumSq += channelData[j] * channelData[j];
    }
    const rms = Math.sqrt(sumSq / samplesPerBucket);
    rmsDb[i] = rms > 0 ? 20 * Math.log10(rms) : -80;
  }

  return { rmsDb, bucketDuration };
}

/**
 * Compute per-bucket absolute peaks for waveform visualization.
 * Uses a fixed bucket count (for canvas fidelity).
 */
export function computeVisualizationPeaks(
  channelData: Float32Array,
  bucketCount: number,
): Float32Array {
  const samplesPerBucket = Math.floor(channelData.length / bucketCount);
  const peaks = new Float32Array(bucketCount);

  for (let i = 0; i < bucketCount; i++) {
    const start = i * samplesPerBucket;
    const end = Math.min(start + samplesPerBucket, channelData.length);
    let peak = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > peak) peak = abs;
    }
    peaks[i] = peak;
  }

  return peaks;
}

/**
 * Detect silence segments from RMS-dB buckets.
 * Returns segments in seconds (after padding applied).
 */
export function detectSilences(
  rmsDb: Float32Array,
  bucketDuration: number,
  params: SilenceParams,
): SilenceSegment[] {
  const { threshold, minLength, padding } = params;
  const raw: SilenceSegment[] = [];

  let runStart = -1;
  for (let i = 0; i < rmsDb.length; i++) {
    const silent = rmsDb[i] < threshold;
    if (silent && runStart === -1) {
      runStart = i;
    } else if (!silent && runStart !== -1) {
      const startT = runStart * bucketDuration;
      const endT = i * bucketDuration;
      if (endT - startT >= minLength) {
        raw.push({ start: startT, end: endT });
      }
      runStart = -1;
    }
  }

  // Silence extending to end of file
  if (runStart !== -1) {
    const startT = runStart * bucketDuration;
    const endT = rmsDb.length * bucketDuration;
    if (endT - startT >= minLength) {
      raw.push({ start: startT, end: endT });
    }
  }

  // Apply padding (shrink each silence inward)
  return raw
    .map((s) => ({ start: s.start + padding, end: s.end - padding }))
    .filter((s) => s.end - s.start > 0.05);
}

/**
 * Compute the segments to keep (complement of silences).
 */
export function getKeepSegments(
  silences: SilenceSegment[],
  duration: number,
): SilenceSegment[] {
  const keep: SilenceSegment[] = [];
  let cursor = 0;

  for (const s of silences) {
    if (s.start > cursor + 0.05) {
      keep.push({ start: cursor, end: s.start });
    }
    cursor = s.end;
  }

  if (cursor < duration - 0.05) {
    keep.push({ start: cursor, end: duration });
  }

  return keep;
}

export function totalSilenceDuration(silences: SilenceSegment[]): number {
  return silences.reduce((sum, s) => sum + (s.end - s.start), 0);
}
