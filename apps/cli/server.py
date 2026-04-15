"""
TACET local FastAPI backend — optional, auto-detected by web app on localhost:7878.

Enables the web UI to offload processing to native ffmpeg (no 1.5 GB browser limit).

Install: pip install fastapi uvicorn python-multipart
Run:     python server.py
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

try:
    from fastapi import FastAPI, File, Form, HTTPException, UploadFile
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse
    import uvicorn
except ImportError:
    print("FastAPI not installed. Run: pip install fastapi uvicorn python-multipart")
    raise

from detect import detect_silences, extract_rms_db, get_keep_segments

app = FastAPI(title="TACET Local Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

PORT = 7878


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": "0.1.0"}


@app.post("/detect")
async def detect_route(
    file: UploadFile = File(...),
    threshold: float = Form(-40.0),
    min_length: float = Form(0.4),
    padding: float = Form(0.1),
) -> dict:
    """Detect silences in uploaded video."""
    with tempfile.NamedTemporaryFile(suffix=Path(file.filename or "input.mp4").suffix, delete=False) as tmp:
        tmp_path = Path(tmp.name)
        content = await file.read()
        tmp.write(content)

    try:
        rms_db, bucket_duration, duration = extract_rms_db(tmp_path)
        silences = detect_silences(rms_db, bucket_duration, threshold, min_length, padding)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        tmp_path.unlink(missing_ok=True)

    return {
        "duration": duration,
        "silences": [s.to_dict() for s in silences],
        "total_silence": sum(s.duration() for s in silences),
    }


@app.post("/export")
async def export_route(
    file: UploadFile = File(...),
    silences_json: str = Form(...),
    threshold: float = Form(-40.0),
    min_length: float = Form(0.4),
    padding: float = Form(0.1),
) -> FileResponse:
    """Export video with silences removed. Returns processed MP4."""
    import subprocess
    from detect import SilenceSegment

    suffix = Path(file.filename or "input.mp4").suffix
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp_in:
        input_path = Path(tmp_in.name)
        input_path.write_bytes(await file.read())

    output_path = input_path.with_name(input_path.stem + "_tacet.mp4")

    try:
        rms_db, bucket_duration, duration = extract_rms_db(input_path)
        silences = detect_silences(rms_db, bucket_duration, threshold, min_length, padding)
        keep = get_keep_segments(silences, duration)

        if not keep:
            raise HTTPException(status_code=422, detail="Entire video is silence")

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

        result = subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", str(input_path),
                "-filter_complex", ";".join(filter_parts),
                "-map", "[outv]", "-map", "[outa]",
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23",
                "-c:a", "aac", "-b:a", "128k",
                str(output_path),
            ],
            capture_output=True,
        )

        if result.returncode != 0:
            raise HTTPException(status_code=500, detail="ffmpeg export failed")

        original_name = Path(file.filename or "output").stem
        return FileResponse(
            path=str(output_path),
            media_type="video/mp4",
            filename=f"{original_name}.tacet.mp4",
            background=None,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        input_path.unlink(missing_ok=True)


if __name__ == "__main__":
    print(f"TACET local backend starting on http://localhost:{PORT}")
    print("Press Ctrl+C to stop")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")
