# TACET — Algorithm Specification

This document is the canonical reference. Both `apps/web/lib/silence.ts` and `apps/cli/detect.py`
must produce identical output on the same input.

## Input

Any video file with an audio track.

## Step 1 — Audio extraction

```
ffmpeg -i input -ac 1 -ar 16000 -vn output.wav
```

- Mono (`-ac 1`)
- 16 kHz sample rate (`-ar 16000`)
- No video (`-vn`)
- PCM s16le encoding

## Step 2 — Per-bucket RMS in dB

```
BUCKETS_PER_SECOND = 100          # 10 ms per bucket
samples_per_bucket = sample_rate // BUCKETS_PER_SECOND  # = 160 @ 16 kHz
bucket_duration    = samples_per_bucket / sample_rate   # = 0.01 s
```

For each bucket `i`:

```
samples = channel_data[i*spb : (i+1)*spb]
rms     = sqrt(mean(samples^2))
db      = 20 * log10(rms)  if rms > 0  else  -80
```

PCM s16le samples must be normalized to [-1.0, 1.0] before computing RMS:
`normalized = raw_s16 / 32768.0`

## Step 3 — Detect raw silence runs

```
for each bucket i:
    silent = db[i] < threshold
    track run_start / run_end
    emit run when: (run ends) AND (duration >= min_length)
```

Also emit a run if silence extends to the last bucket.

## Step 4 — Apply padding

```
for each raw_silence:
    start_padded = raw.start + padding
    end_padded   = raw.end   - padding
    keep if (end_padded - start_padded) > 0.05 s
```

## Step 5 — Output

List of `{start, end}` in seconds (floating point).

## Default parameters

| Parameter   | Default | Range       | Description                     |
|-------------|---------|-------------|---------------------------------|
| threshold   | -40 dB  | -60 to -20  | Silence boundary                |
| min_length  | 0.4 s   | 0.1 to 2.0  | Discard shorter runs            |
| padding     | 0.1 s   | 0.0 to 0.5  | Buffer inward on both sides     |

## Export — keep segments

Keep segments are the complement of detected silences:

```
cursor = 0
for each silence:
    if silence.start > cursor + 0.05:
        emit keep(cursor, silence.start)
    cursor = silence.end
if cursor < duration - 0.05:
    emit keep(cursor, duration)
```

## Cross-implementation tolerance

CI tests allow ±1 bucket (10 ms) tolerance between web and CLI outputs on the same fixture.
Differences beyond 10 ms indicate an algorithmic divergence and must be fixed.
