import {
  detectSilences,
  getKeepSegments,
  computeDetectionBuckets,
  totalSilenceDuration,
  DEFAULT_PARAMS,
  type SilenceSegment,
} from '../silence';

// Helper: build a Float32Array with silence (0.0) and speech (1.0) blocks
function buildChannelData(
  sampleRate: number,
  blocks: Array<{ duration: number; amplitude: number }>,
): Float32Array {
  const totalSamples = Math.round(
    blocks.reduce((sum, b) => sum + b.duration * sampleRate, 0),
  );
  const data = new Float32Array(totalSamples);
  let offset = 0;
  for (const block of blocks) {
    const samples = Math.round(block.duration * sampleRate);
    if (block.amplitude > 0) {
      for (let i = 0; i < samples; i++) {
        // Sine wave at amplitude to get predictable RMS
        data[offset + i] = block.amplitude * Math.sin((i / samples) * Math.PI * 2);
      }
    }
    // Zero amplitude = silence (already 0)
    offset += samples;
  }
  return data;
}

const SR = 16000;

describe('computeDetectionBuckets', () => {
  it('produces 10ms buckets', () => {
    const data = new Float32Array(SR * 2); // 2 seconds
    const { bucketDuration, rmsDb } = computeDetectionBuckets(data, SR);

    expect(bucketDuration).toBeCloseTo(0.01, 4);
    // 2s at 10ms = 200 buckets
    expect(rmsDb.length).toBe(200);
  });

  it('returns -80 dB for pure silence', () => {
    const data = new Float32Array(SR); // 1 second of zeros
    const { rmsDb } = computeDetectionBuckets(data, SR);
    rmsDb.forEach((db) => expect(db).toBe(-80));
  });

  it('returns positive dB for non-silence', () => {
    const data = new Float32Array(SR);
    data.fill(0.5); // Constant 0.5 amplitude
    const { rmsDb } = computeDetectionBuckets(data, SR);
    // RMS of 0.5 constant signal = 0.5 → 20*log10(0.5) ≈ -6 dB
    rmsDb.forEach((db) => expect(db).toBeCloseTo(-6.02, 0));
  });
});

describe('detectSilences', () => {
  it('detects a simple silence in the middle', () => {
    // 1s speech, 1s silence, 1s speech
    const channelData = buildChannelData(SR, [
      { duration: 1, amplitude: 0.5 },
      { duration: 1, amplitude: 0 },
      { duration: 1, amplitude: 0.5 },
    ]);
    const { rmsDb, bucketDuration } = computeDetectionBuckets(channelData, SR);
    const silences = detectSilences(rmsDb, bucketDuration, DEFAULT_PARAMS);

    expect(silences).toHaveLength(1);
    // After padding (0.1s each side), silence should start ~1.1 and end ~1.9
    expect(silences[0].start).toBeCloseTo(1.1, 1);
    expect(silences[0].end).toBeCloseTo(1.9, 1);
  });

  it('ignores silences shorter than minLength', () => {
    // Very short silence (0.1s) below default minLength (0.4s)
    const channelData = buildChannelData(SR, [
      { duration: 1, amplitude: 0.5 },
      { duration: 0.1, amplitude: 0 },
      { duration: 1, amplitude: 0.5 },
    ]);
    const { rmsDb, bucketDuration } = computeDetectionBuckets(channelData, SR);
    const silences = detectSilences(rmsDb, bucketDuration, DEFAULT_PARAMS);

    expect(silences).toHaveLength(0);
  });

  it('discards silence segments shorter than 50ms after padding', () => {
    // Silence of exactly minLength (0.4s) with padding 0.25s each side → 0.4 - 0.5 = -0.1 → discarded
    const channelData = buildChannelData(SR, [
      { duration: 1, amplitude: 0.5 },
      { duration: 0.4, amplitude: 0 },
      { duration: 1, amplitude: 0.5 },
    ]);
    const { rmsDb, bucketDuration } = computeDetectionBuckets(channelData, SR);
    const silences = detectSilences(rmsDb, bucketDuration, {
      threshold: -40,
      minLength: 0.4,
      padding: 0.25,
    });

    // 0.4s raw - 0.5s padding = negative → discarded
    expect(silences).toHaveLength(0);
  });

  it('detects silence at end of file', () => {
    const channelData = buildChannelData(SR, [
      { duration: 1, amplitude: 0.5 },
      { duration: 1, amplitude: 0 },
    ]);
    const { rmsDb, bucketDuration } = computeDetectionBuckets(channelData, SR);
    const silences = detectSilences(rmsDb, bucketDuration, DEFAULT_PARAMS);

    expect(silences).toHaveLength(1);
  });

  it('returns empty array when no silences detected', () => {
    const channelData = new Float32Array(SR * 2).fill(0.5);
    const { rmsDb, bucketDuration } = computeDetectionBuckets(channelData, SR);
    const silences = detectSilences(rmsDb, bucketDuration, DEFAULT_PARAMS);

    expect(silences).toHaveLength(0);
  });
});

describe('getKeepSegments', () => {
  it('returns full duration when no silences', () => {
    const keep = getKeepSegments([], 10);
    expect(keep).toEqual([{ start: 0, end: 10 }]);
  });

  it('correctly splits around a silence', () => {
    const silences: SilenceSegment[] = [{ start: 2, end: 4 }];
    const keep = getKeepSegments(silences, 10);

    expect(keep).toHaveLength(2);
    expect(keep[0]).toEqual({ start: 0, end: 2 });
    expect(keep[1]).toEqual({ start: 4, end: 10 });
  });

  it('handles silence at the start', () => {
    const silences: SilenceSegment[] = [{ start: 0, end: 2 }];
    const keep = getKeepSegments(silences, 10);

    expect(keep).toHaveLength(1);
    expect(keep[0]).toEqual({ start: 2, end: 10 });
  });

  it('handles silence at the end', () => {
    const silences: SilenceSegment[] = [{ start: 8, end: 10 }];
    const keep = getKeepSegments(silences, 10);

    expect(keep).toHaveLength(1);
    expect(keep[0]).toEqual({ start: 0, end: 8 });
  });

  it('returns empty array when entire duration is silence', () => {
    const silences: SilenceSegment[] = [{ start: 0, end: 10 }];
    const keep = getKeepSegments(silences, 10);

    expect(keep).toHaveLength(0);
  });
});

describe('totalSilenceDuration', () => {
  it('sums silence durations', () => {
    const silences: SilenceSegment[] = [
      { start: 1, end: 2 },
      { start: 4, end: 5.5 },
    ];
    expect(totalSilenceDuration(silences)).toBeCloseTo(2.5);
  });

  it('returns 0 for empty array', () => {
    expect(totalSilenceDuration([])).toBe(0);
  });
});
