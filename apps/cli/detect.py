"""
Silence detection algorithm — must stay in sync with apps/web/lib/silence.ts
See packages/shared/algorithm-spec.md for the canonical spec.
"""

from __future__ import annotations

import math
import struct
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator


BUCKET_DURATION = 0.01  # 10ms buckets


@dataclass
class SilenceSegment:
    start: float
    end: float

    def duration(self) -> float:
        return self.end - self.start

    def to_dict(self) -> dict[str, float]:
        return {"start": round(self.start, 4), "end": round(self.end, 4)}


def extract_rms_db(
    input_path: Path,
) -> tuple[list[float], float, float]:
    """
    Extract audio from video, compute per-10ms-bucket RMS in dB.

    Returns:
        rms_db: list of dB values per bucket
        bucket_duration: seconds per bucket (0.01)
        duration: total audio duration in seconds
    """
    _check_ffmpeg()

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    try:
        # Extract mono 16kHz PCM — matches web version
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", str(input_path),
                "-ac", "1",
                "-ar", "16000",
                "-vn",
                "-f", "s16le",
                str(tmp_path),
            ],
            check=True,
            capture_output=True,
        )

        sample_rate = 16000
        samples_per_bucket = sample_rate // 100  # 10ms = 160 samples at 16kHz
        rms_db: list[float] = []

        raw = tmp_path.read_bytes()
        total_samples = len(raw) // 2  # s16le = 2 bytes per sample
        duration = total_samples / sample_rate

        for bucket_start in _bucket_ranges(total_samples, samples_per_bucket):
            start_byte = bucket_start * 2
            end_byte = (bucket_start + samples_per_bucket) * 2
            chunk = raw[start_byte:end_byte]

            if len(chunk) < 2:
                break

            n = len(chunk) // 2
            samples = struct.unpack(f"<{n}h", chunk[: n * 2])

            # Normalize s16 → float [-1.0, 1.0]
            sum_sq = sum((s / 32768.0) ** 2 for s in samples)
            rms = math.sqrt(sum_sq / n)
            db = 20 * math.log10(rms) if rms > 0 else -80.0
            rms_db.append(db)

    finally:
        tmp_path.unlink(missing_ok=True)

    return rms_db, BUCKET_DURATION, duration


def _bucket_ranges(total_samples: int, bucket_size: int) -> Iterator[int]:
    start = 0
    while start + bucket_size <= total_samples:
        yield start
        start += bucket_size


def detect_silences(
    rms_db: list[float],
    bucket_duration: float,
    threshold: float = -40.0,
    min_length: float = 0.4,
    padding: float = 0.1,
) -> list[SilenceSegment]:
    """
    Detect silence segments from RMS-dB buckets.
    Returns segments in seconds (after padding applied).
    """
    raw: list[SilenceSegment] = []
    run_start = -1

    for i, db in enumerate(rms_db):
        silent = db < threshold

        if silent and run_start == -1:
            run_start = i
        elif not silent and run_start != -1:
            start_t = run_start * bucket_duration
            end_t = i * bucket_duration
            if end_t - start_t >= min_length:
                raw.append(SilenceSegment(start_t, end_t))
            run_start = -1

    # Silence extending to end of file
    if run_start != -1:
        start_t = run_start * bucket_duration
        end_t = len(rms_db) * bucket_duration
        if end_t - start_t >= min_length:
            raw.append(SilenceSegment(start_t, end_t))

    # Apply padding (shrink each silence inward)
    padded = [
        SilenceSegment(s.start + padding, s.end - padding)
        for s in raw
        if (s.end - padding) - (s.start + padding) > 0.05
    ]

    return padded


def get_keep_segments(
    silences: list[SilenceSegment],
    duration: float,
) -> list[SilenceSegment]:
    """Compute segments to keep (complement of silences)."""
    keep: list[SilenceSegment] = []
    cursor = 0.0

    for s in silences:
        if s.start > cursor + 0.05:
            keep.append(SilenceSegment(cursor, s.start))
        cursor = s.end

    if cursor < duration - 0.05:
        keep.append(SilenceSegment(cursor, duration))

    return keep


def _check_ffmpeg() -> None:
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError("ffmpeg returned non-zero exit code")
    except FileNotFoundError:
        raise RuntimeError(
            "ffmpeg not found. Install ffmpeg and ensure it is in PATH.\n"
            "  Windows: winget install Gyan.FFmpeg\n"
            "  macOS:   brew install ffmpeg\n"
            "  Linux:   apt install ffmpeg"
        )
