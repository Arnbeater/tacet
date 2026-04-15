# Changelog

## [0.1.0] - 2026-04-15

### Added
- TACET web app (Next.js 14, TypeScript, Tailwind) — drop video, see waveform, export silence-trimmed MP4
- `apps/web`: full browser-side processing via ffmpeg.wasm + Web Audio API
  - Drag & drop / click-to-browse file selection
  - Canvas waveform with live silence overlays, threshold line, playhead
  - Three parameter sliders: threshold (dB), min silence length, padding — live re-detect
  - Preview mode: real-time skip over detected silences during playback
  - Export: ffmpeg filter_complex trim+concat, auto-download as `{name}.tacet.mp4`
  - Large file warning (>1.5 GB) with CLI suggestion
  - Local backend auto-detection on `localhost:7878`
- `apps/cli`: Python CLI (`tacet.py`) using native ffmpeg
  - Same detection algorithm as web — identical results on shared fixtures
  - Flags: `--threshold`, `--min-len`, `--padding`, `--dry-run`, `--json`
  - Optional FastAPI server (`server.py`) on port 7878
- Shared algorithm spec (`packages/shared/algorithm-spec.md`)
- Unit tests for silence detection, padding edge cases, segment complement
- CI workflow: lint + typecheck + test on push/PR

### Future
- Keyframe-snap stream-copy export (no re-encode)
- Batch processing mode
- Subtitle/chapter export
- Custom output codec selection
- Word-level silence detection via Whisper transcription
