import logging
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.routers import analyze, docs_route, export_route, generate, import_docx, workspace_route

_level_name = os.getenv("LOG_LEVEL", "INFO").upper()
_level = getattr(logging, _level_name, logging.INFO)
logging.basicConfig(
    level=_level,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    force=True,
)

app = FastAPI(title="Docs-agent API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router)
app.include_router(docs_route.router)
app.include_router(generate.router)
app.include_router(export_route.router)
app.include_router(import_docx.router)
app.include_router(workspace_route.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


_frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
_root_resolved = _frontend_dist.resolve()

if _frontend_dist.is_dir():

    @app.get("/")
    async def spa_index():
        return FileResponse(_frontend_dist / "index.html")

    @app.get("/{full_path:path}")
    async def spa_or_static(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404)
        safe = (_frontend_dist / full_path).resolve()
        try:
            safe.relative_to(_root_resolved)
        except ValueError:
            return FileResponse(_frontend_dist / "index.html")
        if safe.is_file():
            return FileResponse(safe)
        return FileResponse(_frontend_dist / "index.html")
