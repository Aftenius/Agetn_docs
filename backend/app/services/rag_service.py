"""Local RAG: chunked text in SQLite, optional OpenAI-compatible embeddings."""

from __future__ import annotations

import array
import io
import logging
import math
import re
import sqlite3
import time
from pathlib import Path

import mammoth
from bs4 import BeautifulSoup
from pypdf import PdfReader

from app.config import embedding_api_key, embedding_base_url, embedding_model
from app.services.workspace import ensure_workspace_dirs, rag_index_dir

log = logging.getLogger(__name__)

_CHUNK_CHARS = 1200
_CHUNK_OVERLAP = 150


def _db_path() -> Path:
    ensure_workspace_dirs()
    d = rag_index_dir()
    d.mkdir(parents=True, exist_ok=True)
    return d / "chunks.db"


def _init_db(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            chunk_idx INTEGER NOT NULL,
            text TEXT NOT NULL,
            embedding BLOB
        )
        """
    )
    conn.commit()


def embed_text(text: str) -> list[float] | None:
    key = embedding_api_key()
    if not key:
        return None
    from openai import OpenAI

    client = OpenAI(api_key=key, base_url=embedding_base_url())
    t = " ".join(text.split())[:8000]
    if not t:
        return None
    t0 = time.perf_counter()
    r = client.embeddings.create(model=embedding_model(), input=t)
    log.debug(
        "rag.embeddings.create model=%s elapsed_s=%.3f input_len=%s",
        embedding_model(),
        time.perf_counter() - t0,
        len(t),
    )
    return list(r.data[0].embedding)


def _embedding_to_blob(vec: list[float]) -> bytes:
    return array.array("f", vec).tobytes()


def _blob_to_embedding(blob: bytes) -> list[float]:
    arr = array.array("f")
    arr.frombytes(blob)
    return arr.tolist()


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na <= 0 or nb <= 0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


def _keyword_score(query: str, text: str) -> float:
    q_tokens = {t for t in re.split(r"\W+", query.lower()) if len(t) > 2}
    if not q_tokens:
        return 0.0
    low = text.lower()
    return sum(1.0 for t in q_tokens if t in low)


def _chunk_text(s: str) -> list[str]:
    s = " ".join(s.split())
    if not s:
        return []
    out: list[str] = []
    start = 0
    while start < len(s):
        end = min(len(s), start + _CHUNK_CHARS)
        out.append(s[start:end])
        if end >= len(s):
            break
        start = max(0, end - _CHUNK_OVERLAP)
    return out


def _extract_text(path: Path) -> str:
    suf = path.suffix.lower()
    if suf == ".txt":
        return path.read_text(encoding="utf-8", errors="replace")
    if suf == ".pdf":
        reader = PdfReader(str(path))
        parts: list[str] = []
        for page in reader.pages:
            parts.append(page.extract_text() or "")
        return "\n".join(parts)
    if suf == ".docx":
        result = mammoth.convert_to_html(io.BytesIO(path.read_bytes()))
        soup = BeautifulSoup(result.value or "", "html.parser")
        return soup.get_text(separator=" ", strip=True)
    return ""


def ingest_file(path: Path, original_name: str | None = None) -> int:
    text = _extract_text(path)
    if not text.strip():
        return 0
    chunks = _chunk_text(text)
    source = original_name or path.name
    conn = sqlite3.connect(_db_path())
    try:
        _init_db(conn)
        n = 0
        for i, ch in enumerate(chunks):
            emb = embed_text(ch)
            blob = _embedding_to_blob(emb) if emb else None
            conn.execute(
                "INSERT INTO chunks (source, chunk_idx, text, embedding) VALUES (?,?,?,?)",
                (source, i, ch, blob),
            )
            n += 1
        conn.commit()
        return n
    finally:
        conn.close()


def rag_status() -> dict:
    conn = sqlite3.connect(_db_path())
    try:
        _init_db(conn)
        row = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()
        n = int(row[0]) if row else 0
        with_emb = conn.execute(
            "SELECT COUNT(*) FROM chunks WHERE embedding IS NOT NULL"
        ).fetchone()
        ne = int(with_emb[0]) if with_emb else 0
        cur = conn.execute(
            "SELECT source, COUNT(*) AS c FROM chunks GROUP BY source ORDER BY source COLLATE NOCASE"
        )
        sources = [{"source": str(s), "chunks": int(c)} for s, c in cur.fetchall()]
    finally:
        conn.close()
    return {
        "chunks": n,
        "chunks_with_embeddings": ne,
        "embeddings_configured": bool(embedding_api_key()),
        "db_path": str(_db_path()),
        "sources": sources,
    }


def retrieve_for_query(query: str, top_k: int = 5) -> tuple[str, int]:
    conn = sqlite3.connect(_db_path())
    try:
        _init_db(conn)
        row = conn.execute("SELECT COUNT(*) FROM chunks").fetchone()
        total = int(row[0]) if row else 0
        if total == 0:
            return "", 0
        cur = conn.execute("SELECT source, chunk_idx, text, embedding FROM chunks")
        rows = cur.fetchall()
    finally:
        conn.close()

    q_emb = embed_text(query)
    scored: list[tuple[float, str, str]] = []
    for source, idx, text, emb_blob in rows:
        if q_emb and emb_blob:
            try:
                vec = _blob_to_embedding(emb_blob)
                s = _cosine(q_emb, vec)
            except (ValueError, TypeError):
                s = _keyword_score(query, text)
        else:
            s = _keyword_score(query, text)
        scored.append((s, f"{source}#{idx}", text))

    scored.sort(key=lambda x: -x[0])
    top = scored[:top_k]
    parts: list[str] = []
    for _s, label, chunk in top:
        t = chunk.strip()
        if len(t) < 20:
            continue
        parts.append(f"[{label}]\n{t[:2000]}")
    return "\n\n---\n\n".join(parts), total


def delete_chunks_by_source(source: str) -> int:
    """Удаляет все чанки с указанным полем source (как при индексации)."""
    name = (source or "").strip()
    if not name:
        return 0
    conn = sqlite3.connect(_db_path())
    try:
        _init_db(conn)
        cur = conn.execute("DELETE FROM chunks WHERE source = ?", (name,))
        conn.commit()
        return int(cur.rowcount or 0)
    finally:
        conn.close()


def clear_all_chunks() -> int:
    """Удаляет все строки из индекса RAG."""
    conn = sqlite3.connect(_db_path())
    try:
        _init_db(conn)
        cur = conn.execute("DELETE FROM chunks")
        conn.commit()
        return int(cur.rowcount or 0)
    finally:
        conn.close()
