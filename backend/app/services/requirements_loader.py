import io
import json
import re
from functools import lru_cache
from pathlib import Path

import mammoth
from bs4 import BeautifulSoup

from app.services.workspace import (
    checklist_docx_repo_path,
    checklist_docx_workspace_path,
    checklist_json_repo_path,
    checklist_json_workspace_path,
    contract_template_docx_repo_path,
    contract_template_docx_workspace_path,
    requirements_repo_path,
    requirements_workspace_path,
)


def _slug_from_label(label: str) -> str:
    t = "_".join(label.strip().lower().split())
    t = re.sub(r"[^\w\-]", "", t, flags=re.UNICODE)
    t = re.sub(r"_+", "_", t).strip("_")
    return (t or "item")[:80]


def _parse_checklist_docx(path: Path) -> list[dict[str, str]]:
    raw = path.read_bytes()
    result = mammoth.convert_to_html(io.BytesIO(raw))
    soup = BeautifulSoup(result.value or "", "html.parser")
    items: list[dict[str, str]] = []
    seen_labels: set[str] = set()
    id_counts: dict[str, int] = {}

    for li in soup.find_all("li"):
        text = " ".join(li.get_text().split())
        if len(text) < 2:
            continue
        if text in seen_labels:
            continue
        seen_labels.add(text)
        base = _slug_from_label(text)
        n = id_counts.get(base, 0)
        id_counts[base] = n + 1
        uid = base if n == 0 else f"{base}_{n}"
        items.append({"id": uid, "label": text})

    if not items:
        for p in soup.find_all("p"):
            text = " ".join(p.get_text().split())
            if len(text) < 3:
                continue
            if text in seen_labels:
                continue
            seen_labels.add(text)
            base = _slug_from_label(text)
            n = id_counts.get(base, 0)
            id_counts[base] = n + 1
            uid = base if n == 0 else f"{base}_{n}"
            items.append({"id": uid, "label": text})

    return items


def _load_checklist_from_json(path: Path) -> tuple[dict[str, str], ...] | None:
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    if not isinstance(data, list):
        return None
    out: list[dict[str, str]] = []
    for x in data:
        if not isinstance(x, dict):
            continue
        lab = x.get("label")
        if not lab:
            continue
        i = str(x.get("id") or _slug_from_label(str(lab)))
        out.append({"id": i, "label": str(lab)})
    return tuple(out)


@lru_cache
def _checklist_bundle() -> tuple[str, tuple[dict[str, str], ...]]:
    """Источник чек-листа (ключ) и пункты в порядке приоритета загрузчиков."""
    w_docx = checklist_docx_workspace_path()
    if w_docx.is_file():
        rows = _parse_checklist_docx(w_docx)
        if rows:
            return ("workspace_docx", tuple(dict(x) for x in rows))

    j = _load_checklist_from_json(checklist_json_workspace_path())
    if j:
        return ("workspace_json", j)

    r_docx = checklist_docx_repo_path()
    if r_docx.is_file():
        rows = _parse_checklist_docx(r_docx)
        if rows:
            return ("repo_docx", tuple(dict(x) for x in rows))

    j2 = _load_checklist_from_json(checklist_json_repo_path())
    if j2:
        return ("repo_json", j2)

    return ("empty", tuple())


def _checklist_items_tuple() -> tuple[dict[str, str], ...]:
    return _checklist_bundle()[1]


def checklist_api_dict() -> dict:
    src, items = _checklist_bundle()
    legends = {
        "workspace_docx": "DOCX «ФИНАЛЬНЫЙ ЧЕК-ЛИСТ» в workspace (высший приоритет)",
        "workspace_json": "checklist.json в workspace",
        "repo_docx": "DOCX в каталоге docs/ репозитория",
        "repo_json": "data/checklist.json в репозитории",
        "empty": "нет пунктов (пустой чек-лист)",
    }
    return {
        "effective_source": src,
        "effective_source_label": legends.get(src, src),
        "items": [dict(x) for x in items],
        "workspace_json_path": str(checklist_json_workspace_path()),
        "docx_blocks_json_edit": src == "workspace_docx",
    }


def save_workspace_checklist_json(raw_items: list[dict]) -> None:
    from app.services.workspace import ensure_workspace_dirs

    ensure_workspace_dirs()
    path = checklist_json_workspace_path()
    seen_ids: set[str] = set()
    normalized: list[dict[str, str]] = []
    for x in raw_items:
        if not isinstance(x, dict):
            continue
        label = str(x.get("label") or "").strip()
        if not label:
            continue
        i = str(x.get("id") or "").strip() or _slug_from_label(label)
        base = i
        counter = 0
        while i in seen_ids:
            counter += 1
            i = f"{base}_{counter}"
        seen_ids.add(i)
        normalized.append({"id": i, "label": label})

    path.write_text(
        json.dumps(normalized, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


@lru_cache
def load_requirements_text() -> str:
    wp = requirements_workspace_path()
    if wp.is_file():
        return wp.read_text(encoding="utf-8")
    rp = requirements_repo_path()
    if rp.is_file():
        return rp.read_text(encoding="utf-8")
    return ""


@lru_cache
def load_checklist_json() -> str:
    items = list(_checklist_items_tuple())
    return json.dumps(items, ensure_ascii=False)


@lru_cache
def load_contract_template_docx_html() -> str:
    for path in (
        contract_template_docx_workspace_path(),
        contract_template_docx_repo_path(),
    ):
        if not path.is_file():
            continue
        try:
            result = mammoth.convert_to_html(io.BytesIO(path.read_bytes()))
            return result.value or ""
        except OSError:
            continue
    return ""
