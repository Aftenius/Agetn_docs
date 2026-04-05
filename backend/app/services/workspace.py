"""Workspace root: company-specific data outside tracked Git defaults."""

from __future__ import annotations

import copy
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from app.config import get_repo_root

CHECKLIST_DOCX_NAME = "ФИНАЛЬНЫЙ ЧЕК-ЛИСТ.docx"
TEMPLATE_DOCX_NAME = "шаблон договора.docx"


@lru_cache
def get_workspace_root() -> Path:
    raw = os.getenv("DOCS_AGENT_WORKSPACE", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return (get_repo_root() / "data" / "workspace" / "default").resolve()


def ensure_workspace_dirs() -> Path:
    root = get_workspace_root()
    for sub in (
        "agents",
        "templates/contracts",
        "samples",
        "rag/inbox",
        "rag_index",
    ):
        (root / sub).mkdir(parents=True, exist_ok=True)
    return root


def agents_workspace_dir() -> Path:
    return get_workspace_root() / "agents"


def agents_builtin_dir() -> Path:
    return get_repo_root() / "backend" / "agents"


def templates_contracts_workspace_dir() -> Path:
    return get_workspace_root() / "templates" / "contracts"


def templates_contracts_repo_dir() -> Path:
    return get_repo_root() / "templates" / "contracts"


def samples_workspace_dir() -> Path:
    return get_workspace_root() / "samples"


def docs_repo_dir() -> Path:
    return get_repo_root() / "docs"


def requirements_workspace_path() -> Path:
    return get_workspace_root() / "requirements.md"


def requirements_repo_path() -> Path:
    return get_repo_root() / "data" / "requirements.md"


def checklist_json_workspace_path() -> Path:
    return get_workspace_root() / "checklist.json"


def checklist_json_repo_path() -> Path:
    return get_repo_root() / "data" / "checklist.json"


def checklist_docx_workspace_path() -> Path:
    return get_workspace_root() / CHECKLIST_DOCX_NAME


def checklist_docx_repo_path() -> Path:
    return get_repo_root() / "docs" / CHECKLIST_DOCX_NAME


def contract_template_docx_workspace_path() -> Path:
    return get_workspace_root() / TEMPLATE_DOCX_NAME


def contract_template_docx_repo_path() -> Path:
    return get_repo_root() / "docs" / TEMPLATE_DOCX_NAME


def settings_yaml_path() -> Path:
    return get_workspace_root() / "settings.yaml"


def rag_index_dir() -> Path:
    return get_workspace_root() / "rag_index"


def rag_inbox_dir() -> Path:
    return get_workspace_root() / "rag" / "inbox"


DEFAULT_SETTINGS: dict[str, Any] = {
    "company_name": "",
    "jurisdiction": "",
    "language": "ru",
    "generation": {
        "structure_instructions": "",
    },
}


def load_settings_dict() -> dict[str, Any]:
    path = settings_yaml_path()
    if not path.is_file():
        return copy.deepcopy(DEFAULT_SETTINGS)
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        return copy.deepcopy(DEFAULT_SETTINGS)
    if not isinstance(raw, dict):
        return copy.deepcopy(DEFAULT_SETTINGS)
    out = copy.deepcopy(DEFAULT_SETTINGS)
    _deep_merge(out, raw)
    return out


def _deep_merge(base: dict, patch: dict) -> None:
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            _deep_merge(base[k], v)
        else:
            base[k] = v


def save_settings_dict(data: dict[str, Any]) -> None:
    ensure_workspace_dirs()
    path = settings_yaml_path()
    path.write_text(
        yaml.safe_dump(data, allow_unicode=True, default_flow_style=False, sort_keys=False),
        encoding="utf-8",
    )


def structure_instructions_for_prompt() -> str:
    s = load_settings_dict()
    gen = s.get("generation") if isinstance(s.get("generation"), dict) else {}
    block = str(gen.get("structure_instructions") or "").strip()
    company = str(s.get("company_name") or "").strip()
    jurisdiction = str(s.get("jurisdiction") or "").strip()
    language = str(s.get("language") or "").strip()
    lines: list[str] = []
    if company:
        lines.append(f"Организация (контекст): {company}.")
    if jurisdiction:
        lines.append(f"Юрисдикция / право: {jurisdiction}.")
    if language and language != "ru":
        lines.append(f"Язык документов: {language}.")
    if block:
        lines.append("Доп. инструкции по структуре и оформлению от организации:\n" + block)
    return "\n".join(lines).strip()


def invalidate_caches_after_settings_change() -> None:
    """Clear loader caches if settings or files on disk may have changed."""
    import app.services.agents_loader as agents_loader
    import app.services.requirements_loader as requirements_loader

    agents_loader.load_agents.cache_clear()
    requirements_loader._checklist_bundle.cache_clear()
    requirements_loader.load_requirements_text.cache_clear()
    requirements_loader.load_checklist_json.cache_clear()
    requirements_loader.load_contract_template_docx_html.cache_clear()
