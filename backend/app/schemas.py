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


class GenerateStructureRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    subject: str = Field(
        ...,
        min_length=1,
        max_length=8000,
        description="Кратко: о чём договор, стороны, предмет",
    )


class WorkspaceGenerationPatch(BaseModel):
    structure_instructions: str | None = None


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
