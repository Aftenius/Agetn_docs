from functools import lru_cache
from pathlib import Path

import yaml

from app.services.workspace import agents_builtin_dir, agents_workspace_dir, ensure_workspace_dirs


def _workspace_agent_yaml_path(agent_id: str) -> Path:
    return agents_workspace_dir() / f"{agent_id}.yaml"


def agent_workspace_file_exists(agent_id: str) -> bool:
    return _workspace_agent_yaml_path(agent_id).is_file()


def save_workspace_agent(data: dict) -> None:
    ensure_workspace_dirs()
    aid = str(data["id"])
    path = _workspace_agent_yaml_path(aid)
    payload = {
        "id": aid,
        "name": str(data.get("name") or aid).strip() or aid,
        "focus_sections": [
            str(s).strip()
            for s in (data.get("focus_sections") or [])
            if str(s).strip()
        ],
        "system_prompt": str(data.get("system_prompt") or ""),
    }
    path.write_text(
        yaml.safe_dump(
            payload,
            allow_unicode=True,
            default_flow_style=False,
            sort_keys=False,
        ),
        encoding="utf-8",
    )


def delete_workspace_agent_file(agent_id: str) -> bool:
    path = _workspace_agent_yaml_path(agent_id)
    if not path.is_file():
        return False
    path.unlink()
    return True


def builtin_agent_ids() -> set[str]:
    """id агентов из backend/agents (без учёта workspace)."""
    return {str(a["id"]) for a in _load_dir_yaml(agents_builtin_dir()) if a.get("id")}


def _load_dir_yaml(base: Path) -> list[dict]:
    out: list[dict] = []
    if not base.is_dir():
        return out
    for path in sorted(base.glob("*.yaml")):
        try:
            data = yaml.safe_load(path.read_text(encoding="utf-8"))
        except (OSError, yaml.YAMLError):
            continue
        if isinstance(data, dict) and data.get("id"):
            out.append(data)
    return out


@lru_cache
def load_agents() -> list[dict]:
    by_id: dict[str, dict] = {}
    for a in _load_dir_yaml(agents_builtin_dir()):
        by_id[str(a["id"])] = a
    for a in _load_dir_yaml(agents_workspace_dir()):
        by_id[str(a["id"])] = a
    return list(by_id.values())


def get_agent(agent_id: str) -> dict | None:
    for a in load_agents():
        if a.get("id") == agent_id:
            return a
    return None
