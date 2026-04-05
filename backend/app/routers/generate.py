import logging
import time
from pathlib import Path

from fastapi import APIRouter, HTTPException
from jinja2 import ChoiceLoader, Environment, FileSystemLoader, select_autoescape
from app.schemas import GenerateDraftRequest, GenerateStructureRequest
from app.services.deepseek import (
    generate_contract_structure,
    generate_draft,
    get_client,
)
from app.services.docs_scanner import extract_text_sample
from app.services.rag_service import retrieve_for_query
from app.services.requirements_loader import (
    load_contract_template_docx_html,
    load_requirements_text,
)
from app.services.workspace import structure_instructions_for_prompt, templates_contracts_repo_dir, templates_contracts_workspace_dir

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["generate"])

_env: Environment | None = None


def reset_jinja_env() -> None:
    global _env
    _env = None


def _jinja_env() -> Environment:
    global _env
    if _env is None:
        ws = templates_contracts_workspace_dir()
        repo = templates_contracts_repo_dir()
        loaders: list[FileSystemLoader] = []
        if ws.is_dir():
            loaders.append(FileSystemLoader(str(ws)))
        loaders.append(FileSystemLoader(str(repo)))
        _env = Environment(
            loader=ChoiceLoader(loaders),
            autoescape=select_autoescape(["html", "xml"]),
        )
    return _env


def _template_file_paths(tmpl_name: str) -> list[Path]:
    out: list[Path] = []
    w = templates_contracts_workspace_dir() / tmpl_name
    if w.is_file():
        out.append(w)
    r = templates_contracts_repo_dir() / tmpl_name
    if r.is_file():
        out.append(r)
    return out


@router.get("/templates")
def list_templates():
    names: set[str] = set()
    for d in (templates_contracts_workspace_dir(), templates_contracts_repo_dir()):
        if d.is_dir():
            names.update(p.name for p in d.glob("*.j2"))
    return {"templates": sorted(names)}


@router.post("/generate-draft")
def generate_draft_route(req: GenerateDraftRequest):
    tmpl_name = req.template_id
    if not tmpl_name:
        tmpl_name = "supply.html.j2" if req.contract_type == "supply" else "services.html.j2"

    paths = _template_file_paths(tmpl_name)
    if not paths:
        raise HTTPException(status_code=404, detail=f"Шаблон не найден: {tmpl_name}")

    try:
        template = _jinja_env().get_template(tmpl_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    body = template.render(**req.fields)

    example_snippet: str | None = None
    if req.example_file_id:
        example_snippet = extract_text_sample(req.example_file_id)
        if not example_snippet:
            raise HTTPException(
                status_code=404, detail="Пример не найден или пустой: " + req.example_file_id
            )

    if not req.use_llm:
        return {"html": body, "source": "jinja_only"}

    try:
        get_client()
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    requirements = load_requirements_text()
    org_block = structure_instructions_for_prompt()
    t0 = time.perf_counter()
    try:
        html = generate_draft(
            filled_fields=req.fields,
            template_body=body,
            example_snippet=example_snippet,
            contract_type=req.contract_type,
            requirements_context=requirements,
            organization_context=org_block,
        )
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"Ошибка DeepSeek при генерации: {e!s}"
        ) from e

    log.info("generate_draft_route total_elapsed_s=%.3f", time.perf_counter() - t0)
    return {"html": html, "source": "jinja_plus_llm"}


@router.post("/generate-structure")
def generate_structure_route(req: GenerateStructureRequest):
    try:
        get_client()
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    template_html = load_contract_template_docx_html()
    requirements = load_requirements_text()
    org_block = structure_instructions_for_prompt()
    t_rag = time.perf_counter()
    q = f"{req.title.strip()}\n{req.subject.strip()}"
    rag_ctx, nchunks = retrieve_for_query(q)
    log.info(
        "generate_structure rag_retrieve elapsed_s=%.3f index_chunks=%s",
        time.perf_counter() - t_rag,
        nchunks,
    )
    t0 = time.perf_counter()
    try:
        html = generate_contract_structure(
            title=req.title.strip(),
            subject=req.subject.strip(),
            template_html_snippet=template_html,
            requirements_context=requirements,
            organization_context=org_block,
            rag_context=rag_ctx,
        )
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"Ошибка DeepSeek при генерации структуры: {e!s}"
        ) from e

    log.info(
        "generate_structure_route llm_total_elapsed_s=%.3f",
        time.perf_counter() - t0,
    )
    return {"html": html}
