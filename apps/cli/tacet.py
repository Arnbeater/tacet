#!/usr/bin/env python3
"""
TACET — Automatic silence removal CLI.

Usage:
    python tacet.py input.mp4 [options]

Options:
    --threshold FLOAT   Silence threshold in dB (default: -40)
    --min-len FLOAT     Minimum silence length in seconds (default: 0.4)
    --padding FLOAT     Padding around speech in seconds (default: 0.1)
    --output PATH       Output file (default: {input}_tacet.mp4)
    --dry-run           Show detected silences without processing
    --json              Output silences as JSON to stdout
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from detect import detect_silences, extract_rms_db, get_keep_segments


def fmt_time(seconds: float) -> str:
    m = int(seconds // 60)
    s = int(seconds % 60)
    return f"{m:02d}:{s:02d}"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="TACET — Automatic silence removal",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("input", help="Input video file")
    parser.add_argument("--output", "-o", help="Output file (default: {input}_tacet.mp4)")
    parser.add_argument(
        "--threshold", "-t",
        type=float,
        default=-40.0,
        metavar="DB",
        help="Silence threshold in dB (default: -40)",
    )
    parser.add_argument(
        "--min-len", "-m",
        type=float,
        default=0.4,
        metavar="SEC",
        help="Minimum silence length in seconds (default: 0.4)",
    )
    parser.add_argument(
        "--padding", "-p",
        type=float,
        default=0.1,
        metavar="SEC",
        help="Padding around speech in seconds (default: 0.1)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show detected silences without exporting",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output silences as JSON to stdout",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: File not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    if args.output:
        output_path = Path(args.output)
    else:
        output_path = input_path.with_stem(input_path.stem + "_tacet").with_suffix(".mp4")

    # ── Analyse ──────────────────────────────────────────────────────────────
    print(f"Analyzing: {input_path.name} ...", file=sys.stderr)

    try:
        rms_db, bucket_duration, duration = extract_rms_db(input_path)
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    silences = detect_silences(
        rms_db,
        bucket_duration,
        threshold=args.threshold,
        min_length=args.min_len,
        padding=args.padding,
    )

    total_silence = sum(s.duration() for s in silences)
    saved_pct = total_silence / duration * 100 if duration > 0 else 0

    print(
        f"Found {len(silences)} silence segments "
        f"({fmt_time(total_silence)} / {fmt_time(duration)} = {saved_pct:.0f}%)",
        file=sys.stderr,
    )

    # ── JSON mode ────────────────────────────────────────────────────────────
    if args.json:
        print(json.dumps([s.to_dict() for s in silences], indent=2))
        return

    # ── Dry-run ──────────────────────────────────────────────────────────────
    if args.dry_run:
        for s in silences:
            print(f"  {s.start:.3f}s – {s.end:.3f}s  ({s.duration():.3f}s)")
        return

    # ── Export ───────────────────────────────────────────────────────────────
    keep = get_keep_segments(silences, duration)

    if not keep:
        print("Error: Entire video is silence. Raise the threshold.", file=sys.stderr)
        sys.exit(1)

    if not silences:
        print("No silences found — output would be identical to input. Skipping.", file=sys.stderr)
        sys.exit(0)

    print(
        f"Exporting {len(keep)} segments → {output_path} ...",
        file=sys.stderr,
    )

    filter_parts: list[str] = []
    for i, seg in enumerate(keep):
        filter_parts.append(
            f"[0:v]trim=start={seg.start:.3f}:end={seg.end:.3f},setpts=PTS-STARTPTS[v{i}]"
        )
        filter_parts.append(
            f"[0:a]atrim=start={seg.start:.3f}:end={seg.end:.3f},asetpts=PTS-STARTPTS[a{i}]"
        )

    concat_inputs = "".join(f"[v{i}][a{i}]" for i in range(len(keep)))
    filter_parts.append(
        f"{concat_inputs}concat=n={len(keep)}:v=1:a=1[outv][outa]"
    )
    filter_complex = ";".join(filter_parts)

    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-filter_complex", filter_complex,
        "-map", "[outv]",
        "-map", "[outa]",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "128k",
        str(output_path),
    ]

    result = subprocess.run(cmd)
    if result.returncode != 0:
        print("Error: ffmpeg export failed.", file=sys.stderr)
        sys.exit(1)

    output_size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"Done: {output_path}  ({output_size_mb:.1f} MB)", file=sys.stderr)


if __name__ == "__main__":
    main()
