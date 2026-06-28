from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import asyncio
import json
from .analyzer import analyze_github_user

app = FastAPI(title="GitHub Profile README Generator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class GenerateRequest(BaseModel):
    username: str

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/generate")
async def generate_readme(req: GenerateRequest):
    username = req.username.strip()
    if not username:
        raise HTTPException(400, "Username is required")
    if not username.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(400, "Invalid GitHub username")

    async def event_stream():
        try:
            async for event in analyze_github_user(username):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
