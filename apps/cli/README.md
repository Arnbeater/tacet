# TACET CLI

Native ffmpeg-based silence removal. No size limits, no browser needed.

## Requirements

- Python 3.10+
- `ffmpeg` in PATH

Install ffmpeg:
- **Windows**: `winget install Gyan.FFmpeg`
- **macOS**: `brew install ffmpeg`
- **Linux**: `apt install ffmpeg`

## Basic usage

```bash
python tacet.py input.mp4
# → input_tacet.mp4
```

## Options

```
--threshold DB    Silence threshold in dB     (default: -40)
--min-len SEC     Minimum silence length       (default: 0.4)
--padding SEC     Buffer around speech         (default: 0.1)
--output PATH     Custom output path
--dry-run         Show detected silences, no export
--json            Output silences as JSON
```

## Examples

```bash
# Aggressive: catch more silences
python tacet.py talk.mp4 --threshold -35

# Conservative: only cut long pauses
python tacet.py talk.mp4 --min-len 1.0

# Preview detected silences
python tacet.py talk.mp4 --dry-run

# Get silences as JSON (for scripting)
python tacet.py talk.mp4 --json > silences.json
```

## Local backend (for web UI)

The web app auto-detects a local backend on `localhost:7878`.
When running, large files bypass the browser's ffmpeg.wasm size limit.

```bash
pip install fastapi uvicorn python-multipart
python server.py
```

## Tests

```bash
pip install pytest
python -m pytest tests/ -v
```
