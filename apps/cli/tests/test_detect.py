"""
Unit tests for silence detection algorithm.
Must match behavior of apps/web/lib/__tests__/silence.test.ts
"""

import math
import struct
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from detect import (
    SilenceSegment,
    detect_silences,
    get_keep_segments,
    BUCKET_DURATION,
)

SAMPLE_RATE = 16000
SAMPLES_PER_BUCKET = SAMPLE_RATE // 100  # 160 samples @ 10ms


def make_rms_db(blocks: list[tuple[float, float]]) -> list[float]:
    """
    Build a synthetic rms_db list from (duration_sec, amplitude) blocks.
    amplitude=0 → -80 dB (silence), amplitude>0 → signal above threshold.
    """
    rms_db: list[float] = []
    for duration, amplitude in blocks:
        n_buckets = round(duration / BUCKET_DURATION)
        if amplitude == 0:
            rms_db.extend([-80.0] * n_buckets)
        else:
            # amplitude 0.5 → RMS ≈ 0.5/√2 ≈ -3 dB — well above -40 threshold
            rms = amplitude / math.sqrt(2)
            db = 20 * math.log10(rms)
            rms_db.extend([db] * n_buckets)
    return rms_db


class TestDetectSilences:
    def test_detects_simple_middle_silence(self):
        # 1s speech, 1s silence, 1s speech
        rms_db = make_rms_db([(1.0, 0.5), (1.0, 0.0), (1.0, 0.5)])
        silences = detect_silences(rms_db, BUCKET_DURATION)

        assert len(silences) == 1
        # After 0.1s padding: start ≈ 1.1, end ≈ 1.9
        assert abs(silences[0].start - 1.1) < 0.02
        assert abs(silences[0].end - 1.9) < 0.02

    def test_ignores_short_silences(self):
        # 0.1s silence — below default min_length of 0.4s
        rms_db = make_rms_db([(1.0, 0.5), (0.1, 0.0), (1.0, 0.5)])
        silences = detect_silences(rms_db, BUCKET_DURATION)
        assert len(silences) == 0

    def test_discards_after_padding_too_small(self):
        # 0.4s silence with 0.25s padding → 0.4 - 0.5 = -0.1 → discarded
        rms_db = make_rms_db([(1.0, 0.5), (0.4, 0.0), (1.0, 0.5)])
        silences = detect_silences(
            rms_db, BUCKET_DURATION, threshold=-40.0, min_length=0.4, padding=0.25
        )
        assert len(silences) == 0

    def test_detects_silence_at_end(self):
        rms_db = make_rms_db([(1.0, 0.5), (1.0, 0.0)])
        silences = detect_silences(rms_db, BUCKET_DURATION)
        assert len(silences) == 1

    def test_no_silences_in_pure_speech(self):
        rms_db = make_rms_db([(3.0, 0.5)])
        silences = detect_silences(rms_db, BUCKET_DURATION)
        assert len(silences) == 0

    def test_multiple_silences(self):
        rms_db = make_rms_db([
            (0.5, 0.5),
            (0.5, 0.0),
            (0.5, 0.5),
            (0.5, 0.0),
            (0.5, 0.5),
        ])
        silences = detect_silences(rms_db, BUCKET_DURATION)
        assert len(silences) == 2

    def test_custom_threshold(self):
        # rms_db values at -50 dB — below -40 threshold but above -60
        rms_db_value = -50.0
        rms_db = [rms_db_value] * 100  # 1 second of signal at -50 dB

        silences_default = detect_silences(rms_db, BUCKET_DURATION, threshold=-40.0)
        silences_lower = detect_silences(rms_db, BUCKET_DURATION, threshold=-60.0)

        assert len(silences_default) == 1  # -50 < -40 → treated as silence
        assert len(silences_lower) == 0    # -50 > -60 → not silence


class TestGetKeepSegments:
    def test_full_duration_when_no_silences(self):
        keep = get_keep_segments([], 10.0)
        assert keep == [SilenceSegment(0.0, 10.0)]

    def test_split_around_middle_silence(self):
        silences = [SilenceSegment(2.0, 4.0)]
        keep = get_keep_segments(silences, 10.0)

        assert len(keep) == 2
        assert keep[0] == SilenceSegment(0.0, 2.0)
        assert keep[1] == SilenceSegment(4.0, 10.0)

    def test_silence_at_start(self):
        silences = [SilenceSegment(0.0, 2.0)]
        keep = get_keep_segments(silences, 10.0)

        assert len(keep) == 1
        assert keep[0] == SilenceSegment(2.0, 10.0)

    def test_silence_at_end(self):
        silences = [SilenceSegment(8.0, 10.0)]
        keep = get_keep_segments(silences, 10.0)

        assert len(keep) == 1
        assert keep[0] == SilenceSegment(0.0, 8.0)

    def test_entire_duration_is_silence(self):
        silences = [SilenceSegment(0.0, 10.0)]
        keep = get_keep_segments(silences, 10.0)
        assert keep == []

    def test_multiple_silences(self):
        silences = [SilenceSegment(1.0, 2.0), SilenceSegment(4.0, 5.0)]
        keep = get_keep_segments(silences, 8.0)

        assert len(keep) == 3
        assert keep[0] == SilenceSegment(0.0, 1.0)
        assert keep[1] == SilenceSegment(2.0, 4.0)
        assert keep[2] == SilenceSegment(5.0, 8.0)


class TestSilenceSegment:
    def test_duration(self):
        s = SilenceSegment(1.0, 3.5)
        assert s.duration() == pytest.approx(2.5)

    def test_to_dict(self):
        s = SilenceSegment(1.1, 2.9)
        d = s.to_dict()
        assert d["start"] == pytest.approx(1.1)
        assert d["end"] == pytest.approx(2.9)
