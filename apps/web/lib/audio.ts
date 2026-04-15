'use client';

import { computeDetectionBuckets, computeVisualizationPeaks } from './silence';

const VIZ_BUCKET_COUNT = 2400; // Enough for 1200px@2x DPR

export interface AudioAnalysis {
  audioBuffer: AudioBuffer;
  peaks: Float32Array;       // Visualization peaks (VIZ_BUCKET_COUNT)
  rmsDb: Float32Array;       // Detection RMS in dB (10ms buckets)
  bucketDuration: number;    // Detection bucket duration in seconds
}

export async function analyzeAudio(wavData: Uint8Array): Promise<AudioAnalysis> {
  const AudioContextClass =
    (typeof window !== 'undefined' && window.AudioContext) ||
    (typeof window !== 'undefined' && (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);

  if (!AudioContextClass) {
    throw new Error('Web Audio API not available in this browser');
  }

  const audioCtx = new AudioContextClass();

  // Copy to ArrayBuffer for decoding
  const arrayBuffer = wavData.buffer.slice(
    wavData.byteOffset,
    wavData.byteOffset + wavData.byteLength,
  );

  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer as ArrayBuffer);
  const channelData = audioBuffer.getChannelData(0);

  const { rmsDb, bucketDuration } = computeDetectionBuckets(channelData, audioBuffer.sampleRate);
  const peaks = computeVisualizationPeaks(channelData, VIZ_BUCKET_COUNT);

  await audioCtx.close();

  return { audioBuffer, peaks, rmsDb, bucketDuration };
}

export function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
