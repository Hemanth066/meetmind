import base64
import io
import os
import re
from typing import Optional

import cv2
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from services.frame_analyzer import FrameAnalyzer
from services.meeting_analyzer import MeetingAnalyzer

load_dotenv()

app = FastAPI(title="MeetMind ML Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

frame_analyzer = FrameAnalyzer()
meeting_analyzer = MeetingAnalyzer()


class FrameRequest(BaseModel):
    frame: str
    participant_id: Optional[str] = None


class MeetingRequest(BaseModel):
    meeting_id: str
    audio_path: Optional[str] = None
    transcript: Optional[str] = ""


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "MeetMind ML",
        "whisper": meeting_analyzer.whisper_available,
        "llm": meeting_analyzer.llm_available,
    }


@app.post("/analyze/frame")
def analyze_frame(req: FrameRequest):
    try:
        image_data = req.frame

        if "," in image_data:
            image_data = image_data.split(",", 1)[1]

        raw = base64.b64decode(image_data)

        arr = np.frombuffer(raw, dtype=np.uint8)

        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(
                status_code=400,
                detail="Invalid image data"
            )

        result = frame_analyzer.analyze(
            img,
            req.participant_id or "unknown"
        )

        return result

    except HTTPException:
        raise

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


@app.post("/analyze/meeting")
def analyze_meeting(req: MeetingRequest):
    try:
        result = meeting_analyzer.analyze(
            meeting_id=req.meeting_id,
            audio_path=req.audio_path,
            transcript=req.transcript or "",
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("ML_PORT", "8001")))
