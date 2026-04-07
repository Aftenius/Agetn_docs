"""Загрузка и сохранение списка компаний (реквизиты) из workspace/companies.yaml."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from app.schemas import WorkspaceCompany
from app.services.workspace import ensure_workspace_dirs, get_workspace_root


def companies_yaml_path() -> Path:
    return get_workspace_root() / "companies.yaml"


@lru_cache
def load_companies_list() -> list[dict[str, Any]]:
    ensure_workspace_dirs()
    path = companies_yaml_path()
    if not path.is_file():
        return []
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        return []
    if not isinstance(raw, dict):
        return []
    items = raw.get("companies")
    if not isinstance(items, list):
        return []
    out: list[dict[str, Any]] = []
    for it in items:
        if isinstance(it, dict):
            out.append(it)
    return out


def get_company_by_id(company_id: str) -> WorkspaceCompany | None:
    cid = (company_id or "").strip()
    if not cid:
        return None
    for row in load_companies_list():
        if str(row.get("id", "")).strip() == cid:
            try:
                return WorkspaceCompany.model_validate(row)
            except Exception:
                return None
    return None


def save_companies_list(companies: list[WorkspaceCompany]) -> None:
    ensure_workspace_dirs()
    path = companies_yaml_path()
    data = {"companies": [c.model_dump() for c in companies]}
    path.write_text(
        yaml.safe_dump(data, allow_unicode=True, default_flow_style=False, sort_keys=False),
        encoding="utf-8",
    )
    load_companies_list.cache_clear()


def format_company_for_structure_prompt(
    c: WorkspaceCompany,
    *,
    our_party: str,
) -> str:
    """Текст для промпта генерации: кто мы (поставщик/покупатель) и реквизиты."""
    role = (
        "Поставщик (реквизиты помещать в соответствующую ячейку как «наша» сторона)"
        if our_party == "supplier"
        else "Покупатель (реквизиты помещать в соответствующую ячейку как «наша» сторона)"
    )
    lines = [
        f"Наша сторона в договоре поставки: {role}.",
        f"Краткое название: {c.display_name}",
        f"Полное наименование: {c.full_legal_name}",
        f"Юридический адрес: {c.address_legal}",
        f"ОГРН: {c.ogrn}, ИНН: {c.inn}, КПП: {c.kpp or '—'}",
        f"Почтовый адрес офиса: {c.address_postal or c.address_legal}",
        f"Банк: {c.bank_name}. р/с {c.rs}, к/с {c.ks}, БИК {c.bik}",
        f"Подписант: {c.signatory_title} — {c.signatory_name}",
    ]
    return "\n".join(lines)
