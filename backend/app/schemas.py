import re
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

AGENT_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


class AnalyzeRequest(BaseModel):
    html: str = Field(..., description="HTML содержимое редактора")
    agent_id: str = Field(default="general")


class GenerateDraftRequest(BaseModel):
    contract_type: str = Field(default="services", description="supply | services")
    template_id: str | None = Field(default=None)
    fields: dict[str, Any] = Field(default_factory=dict)
    example_file_id: str | None = Field(
        default=None,
        description="имя файла в workspace/samples или docs/ (приоритет у samples)",
    )
    use_llm: bool = Field(default=True, description="улучшить черновик через DeepSeek")


class ExportRequest(BaseModel):
    html: str


class DocumentRecord(BaseModel):
    id: str = Field(..., min_length=8, max_length=128)
    title: str = Field(default="", max_length=500)
    html: str = Field(default="")
    updatedAt: str = Field(default="")


class DocumentCreateBody(BaseModel):
    id: str = Field(..., min_length=8, max_length=128)
    title: str = Field(default="Без названия", max_length=500)
    html: str = Field(default="")


class DocumentPutBody(BaseModel):
    title: str | None = Field(default=None, max_length=500)
    html: str | None = None


COMPANY_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


class WorkspaceCompany(BaseModel):
    """Реквизиты стороны для подстановки в договор (файл workspace/companies.yaml)."""

    id: str = Field(..., min_length=1, max_length=64)
    display_name: str = Field(..., min_length=1, max_length=500)
    full_legal_name: str = Field(default="", max_length=2000)
    address_legal: str = Field(default="", max_length=2000)
    ogrn: str = Field(default="", max_length=32)
    inn: str = Field(default="", max_length=32)
    kpp: str = Field(default="", max_length=32)
    address_postal: str = Field(default="", max_length=2000)
    bank_name: str = Field(default="", max_length=500)
    rs: str = Field(default="", max_length=64)
    ks: str = Field(default="", max_length=64)
    bik: str = Field(default="", max_length=32)
    signatory_title: str = Field(default="", max_length=200)
    signatory_name: str = Field(default="", max_length=200)

    @field_validator("id")
    @classmethod
    def validate_company_id(cls, v: str) -> str:
        if not COMPANY_ID_PATTERN.match(v):
            raise ValueError(
                "id: только латиница, цифры, _ и - (1–64 символа)"
            )
        return v


class CompaniesPutBody(BaseModel):
    companies: list[WorkspaceCompany] = Field(default_factory=list)


class GenerateStructureRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    subject: str = Field(
        ...,
        min_length=1,
        max_length=8000,
        description="Кратко: о чём договор, стороны, предмет",
    )
    contract_format: str = Field(
        default="supply",
        description="supply | services (пока используется supply)",
    )
    company_id: str | None = Field(default=None, description="id из companies.yaml")
    our_party: str = Field(
        default="supplier",
        description="supplier | buyer — наша сторона в договоре поставки",
    )
    vat_mode: str = Field(default="vat20", description="vat20 | no_vat")
    vat_note: str = Field(default="", max_length=2000, description="основание без НДС")
    total_amount: str = Field(
        default="",
        max_length=64,
        description="сумма договора числом (строка для Decimal)",
    )
    amount_in_words: str = Field(
        default="",
        max_length=4000,
        description="пропись с фронта или пусто — посчитать на сервере",
    )
    acceptance_days: int | None = Field(default=None, ge=1, le=3650)
    payment_schedule_text: str = Field(default="", max_length=4000)
    extra_terms: str = Field(default="", max_length=8000)
    contract_number: str = Field(default="", max_length=128)
    contract_date: str = Field(default="", max_length=128)

    @field_validator("our_party")
    @classmethod
    def validate_our_party(cls, v: str) -> str:
        x = (v or "supplier").strip().lower()
        if x not in ("supplier", "buyer"):
            raise ValueError("our_party: только supplier или buyer")
        return x

    @field_validator("vat_mode")
    @classmethod
    def validate_vat_mode(cls, v: str) -> str:
        x = (v or "vat20").strip().lower()
        if x not in ("vat20", "no_vat"):
            raise ValueError("vat_mode: только vat20 или no_vat")
        return x


class WorkspaceGenerationPatch(BaseModel):
    structure_instructions: str | None = None
    vat_rate_percent: int | None = Field(default=None, ge=0, le=100)


class WorkspaceSettingsPatch(BaseModel):
    company_name: str | None = None
    jurisdiction: str | None = None
    language: str | None = None
    generation: WorkspaceGenerationPatch | None = None


class ChecklistItemIn(BaseModel):
    id: str = ""
    label: str = Field(..., min_length=1, max_length=4000)

    @model_validator(mode="before")
    @classmethod
    def strip_fields(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        out = dict(data)
        if isinstance(out.get("id"), str):
            out["id"] = out["id"].strip()
        if isinstance(out.get("label"), str):
            out["label"] = out["label"].strip()
        return out


class ChecklistPutBody(BaseModel):
    items: list[ChecklistItemIn] = Field(default_factory=list)


class WorkspaceAgentUpsert(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=200)
    focus_sections: list[str] = Field(default_factory=list)
    system_prompt: str = Field(..., min_length=1, max_length=50_000)

    @model_validator(mode="before")
    @classmethod
    def strip_whitespace(cls, data: object) -> object:
        if not isinstance(data, dict):
            return data
        out = dict(data)
        for key in ("id", "name", "system_prompt"):
            if key in out and isinstance(out[key], str):
                out[key] = out[key].strip()
        return out

    @field_validator("id")
    @classmethod
    def validate_agent_id(cls, v: str) -> str:
        if not AGENT_ID_PATTERN.match(v):
            raise ValueError(
                "id: только латиница, цифры, подчёркивание и дефис (1–64 символа); "
                "без пробелов по краям и без кириллицы в id"
            )
        return v

    @field_validator("focus_sections")
    @classmethod
    def trim_focus(cls, v: list[str]) -> list[str]:
        return [s.strip() for s in v if isinstance(s, str) and s.strip()]
