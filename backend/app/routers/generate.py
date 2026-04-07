import logging
import time
from decimal import Decimal, InvalidOperation
from pathlib import Path

from fastapi import APIRouter, HTTPException
from jinja2 import ChoiceLoader, Environment, FileSystemLoader, select_autoescape
from app.schemas import GenerateDraftRequest, GenerateStructureRequest
from app.services.deepseek import (
    generate_contract_structure,
    generate_draft,
    get_client,
)
from app.services.companies_loader import (
    format_company_for_structure_prompt,
    get_company_by_id,
)
from app.services.docs_scanner import extract_text_sample
from app.services.money_ru import amount_in_words_rubles, payment_schedule_breakdown_rubles
from app.services.rag_service import retrieve_for_query
from app.services.requirements_loader import (
    load_contract_template_docx_html,
    load_requirements_text,
)
from app.services.workspace import (
    get_vat_rate_percent,
    structure_instructions_for_prompt,
    templates_contracts_repo_dir,
    templates_contracts_workspace_dir,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["generate"])


def _parse_total(amount_str: str) -> Decimal | None:
    s = (amount_str or "").strip().replace(" ", "").replace(",", ".")
    if not s:
        return None
    try:
        d = Decimal(s)
    except (InvalidOperation, ValueError):
        return None
    return d if d > 0 else None


def build_structure_structured_context(req: GenerateStructureRequest) -> str:
    parts: list[str] = []
    if (req.contract_format or "supply").lower() == "supply":
        parts.append("Форма договора: договор поставки товаров.")
    else:
        parts.append(f"Форма договора: {req.contract_format}.")

    if req.contract_number.strip() or req.contract_date.strip():
        parts.append(
            "Шапка (используй в <h1> и строке города/даты): № "
            f"{req.contract_number.strip() or '[уточнить: номер]'} от "
            f"{req.contract_date.strip() or '[уточнить: дата]'}"
        )

    if req.company_id and (c := get_company_by_id(req.company_id)):
        parts.append(
            format_company_for_structure_prompt(c, our_party=req.our_party)
        )

    total = _parse_total(req.total_amount)
    words = (req.amount_in_words or "").strip()
    if not words and total is not None:
        words = amount_in_words_rubles(total)
    total_block: list[str] = []
    if total is not None:
        total_block.append(f"Сумма договора (цифрами): {total} руб.")
    if words:
        total_block.append(f"Сумма договора прописью: {words}")
    if total_block:
        parts.append("\n".join(total_block))

    vat_pct = get_vat_rate_percent()
    if req.vat_mode == "no_vat":
        note = (req.vat_note or "").strip() or "участник инновационного центра / иное основание — уточнить в тексте"
        parts.append(
            f"НДС: без НДС. Кратко укажи основание: {note}. Не указывай НДС со ставкой {vat_pct}% или иной числовой ставкой."
        )
    else:
        parts.append(
            f"НДС: ставка {vat_pct}% («в том числе НДС {vat_pct}%» или эквивалентная формулировка). "
            "Не указывай иную процентную ставку НДС, кроме указанной выше и в настройках организации."
        )

    if req.acceptance_days is not None:
        parts.append(
            f"Срок приёмки: оборудования/товара — не позднее {req.acceptance_days} календарных дней "
            "(сформулируй в разделе о приёмке)."
        )

    if (req.payment_schedule_text or "").strip():
        parts.append("Описание графика оплаты от пользователя:\n" + req.payment_schedule_text.strip())
        if total is not None:
            br = payment_schedule_breakdown_rubles(total, req.payment_schedule_text)
            if br:
                parts.append(br)

    if (req.extra_terms or "").strip():
        parts.append("Дополнительные условия:\n" + req.extra_terms.strip())

    return "\n\n".join(parts).strip()



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
    struct_ctx = build_structure_structured_context(req)
    q = f"{req.title.strip()}\n{req.subject.strip()}\n{struct_ctx[:4000]}"
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
            structured_context=struct_ctx,
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
