from pathlib import Path

from docx import Document
from pypdf import PdfReader

from app.services.workspace import docs_repo_dir, samples_workspace_dir


def _collect_dir(root: Path) -> list[dict]:
    root.mkdir(parents=True, exist_ok=True)
    out: list[dict] = []
    for path in sorted(root.iterdir()):
        if path.suffix.lower() not in (".docx", ".pdf"):
            continue
        if path.name.startswith("."):
            continue
        out.append(
            {
                "id": path.name,
                "name": path.stem,
                "format": path.suffix.lower().lstrip("."),
            }
        )
    return out


def list_doc_samples() -> list[dict]:
    ws = samples_workspace_dir()
    legacy = docs_repo_dir()
    seen_names: set[str] = set()
    merged: list[dict] = []

    for item in _collect_dir(ws):
        merged.append(item)
        seen_names.add(item["id"])

    for item in _collect_dir(legacy):
        if item["id"] in seen_names:
            continue
        merged.append(item)

    merged.sort(key=lambda x: (x["name"].lower(), x["id"]))
    return merged


def _resolve_sample_path(filename: str) -> Path | None:
    ws = samples_workspace_dir()
    legacy = docs_repo_dir()
    for base in (ws, legacy):
        path = (base / filename).resolve()
        try:
            path.relative_to(base.resolve())
        except ValueError:
            return None
        if path.is_file():
            return path
    return None


def extract_text_sample(filename: str, max_chars: int = 14_000) -> str:
    path = _resolve_sample_path(filename)
    if not path:
        return ""

    suffix = path.suffix.lower()
    if suffix == ".pdf":
        reader = PdfReader(str(path))
        parts: list[str] = []
        for page in reader.pages:
            parts.append(page.extract_text() or "")
        text = "\n".join(parts)
    elif suffix == ".docx":
        doc = Document(str(path))
        text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    else:
        return ""

    text = " ".join(text.split())
    if len(text) > max_chars:
        text = text[:max_chars] + "..."
    return text
