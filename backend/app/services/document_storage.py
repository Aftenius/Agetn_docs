"""Хранение черновиков договоров в workspace/documents/*.json."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.services.workspace import documents_workspace_dir, ensure_workspace_dirs

_ID_SAFE = re.compile(r"^[a-zA-Z0-9-]{8,128}$")


def _path(doc_id: str) -> Path:
    if not doc_id or not _ID_SAFE.match(doc_id) or ".." in doc_id:
        raise ValueError("Некорректный идентификатор документа")
    return documents_workspace_dir() / f"{doc_id}.json"


def list_documents() -> list[dict[str, Any]]:
    ensure_workspace_dirs()
    d = documents_workspace_dir()
    out: list[dict[str, Any]] = []
    for p in sorted(d.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(raw, dict) and raw.get("id"):
            out.append(raw)
    return out


def get_document(doc_id: str) -> dict[str, Any] | None:
    ensure_workspace_dirs()
    path = _path(doc_id)
    if not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return raw if isinstance(raw, dict) else None


def save_document(
    *,
    doc_id: str,
    title: str,
    html: str,
    updated_at: str | None = None,
) -> dict[str, Any]:
    ensure_workspace_dirs()
    _ = _path(doc_id)  # validate id
    now = updated_at or datetime.now(timezone.utc).isoformat()
    rec = {
        "id": doc_id,
        "title": title or "Без названия",
        "html": html or "",
        "updatedAt": now,
    }
    path = documents_workspace_dir() / f"{doc_id}.json"
    path.write_text(json.dumps(rec, ensure_ascii=False, indent=2), encoding="utf-8")
    return rec


def delete_document(doc_id: str) -> bool:
    ensure_workspace_dirs()
    try:
        path = _path(doc_id)
    except ValueError:
        return False
    if not path.is_file():
        return False
    try:
        path.unlink()
    except OSError:
        return False
    return True
