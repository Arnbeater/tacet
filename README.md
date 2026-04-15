# TACET · auto-editor

*Silentium ex rumore* — Drop a video, see the waveform, export without the silences.

Automatic silence removal for talking-head videos, tutorials, and voice-overs. Everything runs locally — no upload, no tracking.

## Two ways to run

| Mode | File size | Install |
|------|-----------|---------|
| **Browser** (Vercel / localhost) | Up to ~1.5 GB | None — open URL |
| **CLI** (Python + native ffmpeg) | Unlimited | Python + ffmpeg |

---

## Browser app

### Local dev

```bash
# Requires Node.js 18+ and pnpm
npm install -g pnpm
pnpm install
pnpm dev
# → http://localhost:3000
```

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Arnbeater/tacet)

Root directory: `apps/web`

The `next.config.js` sets `Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy` headers
required by `SharedArrayBuffer` (used by ffmpeg.wasm). Vercel respects these automatically.

---

## CLI

### Requirements

- Python 3.10+
- `ffmpeg` in PATH

```bash
# Windows
winget install Gyan.FFmpeg

# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg
```

### Usage

```bash
cd apps/cli

# Basic: removes silences with default settings
python tacet.py input.mp4

# Custom parameters
python tacet.py input.mp4 --threshold -35 --min-len 0.5 --padding 0.15

# Preview detected silences (no export)
python tacet.py input.mp4 --dry-run

# Output silences as JSON (for scripting)
python tacet.py input.mp4 --json
```

### Parameters

| Flag | Default | Description |
|------|---------|-------------|
| `--threshold DB` | `-40` | Silence boundary in dB. Lower = more aggressive. |
| `--min-len SEC` | `0.4` | Discard silence runs shorter than this (preserves breaths). |
| `--padding SEC` | `0.1` | Keep this many seconds around speech edges (softer cuts). |
| `--output PATH` | `{input}_tacet.mp4` | Custom output file. |
| `--dry-run` | — | Print silences without exporting. |
| `--json` | — | Print silences as JSON to stdout. |

### Local backend (optional)

Starts a FastAPI server on `localhost:7878`. The web UI auto-detects it and offloads
processing, removing the 1.5 GB browser limit.

```bash
pip install fastapi uvicorn python-multipart
python apps/cli/server.py
```

---

## How it works

```
1. Extract audio → mono 16 kHz WAV (ffmpeg)
2. Compute RMS per 10ms bucket → dB values
3. Detect runs where dB < threshold AND duration ≥ min_length
4. Shrink each run by `padding` seconds on both sides
5. Export: trim + concat keep-segments (ffmpeg filter_complex)
```

See `packages/shared/algorithm-spec.md` for the canonical specification.
Both web and CLI are guaranteed to produce identical output on the same input.

---

## Project structure

```
tacet/
├── apps/
│   ├── web/          # Next.js 14 browser app
│   └── cli/          # Python CLI + optional FastAPI backend
├── packages/
│   └── shared/       # Algorithm spec (canonical reference)
└── test-fixtures/    # Ground truth for parity tests
```

---

## Troubleshooting

**ffmpeg.wasm won't load**
The page requires `SharedArrayBuffer` which needs COOP/COEP headers. These are set by `next.config.js`.
If you're self-hosting behind a proxy, ensure these headers are forwarded.

**Export stalls at 0%**
Very long videos (>30 min) may take several minutes. The progress bar advances as ffmpeg processes.

**Audio drift in exported video**
This can happen with variable-frame-rate source material. Re-encode the source to CFR first:
```bash
ffmpeg -i input.mp4 -vf fps=30 -c:a copy input_cfr.mp4
```

**CLI: "ffmpeg not found"**
Ensure `ffmpeg` is in your system PATH. Test with: `ffmpeg -version`

---

## Roadmap

- [ ] Keyframe-snap stream-copy export (no re-encode, much faster)
- [ ] Batch processing mode (`tacet.py *.mp4`)
- [ ] Subtitle/chapter export (.srt, .vtt with silence markers)
- [ ] Custom output codec selection
- [ ] Word-level silence detection via Whisper transcription
- [ ] Waveform zoom and manual segment editing

---

## License

MIT © Arnbeater
