import logging
import re
import time

from fastapi import APIRouter, HTTPException

from app.schemas import AnalyzeRequest
from app.services.agents_loader import get_agent, load_agents
from app.services.deepseek import analyze_contract, get_client
from app.services.rag_service import retrieve_for_query
from app.services.requirements_loader import load_checklist_json, load_requirements_text

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["analyze"])


@router.get("/agents")
def list_agents():
    agents = load_agents()
    return [
        {
            "id": a["id"],
            "name": a.get("name", a["id"]),
            "focus_sections": a.get("focus_sections", []),
        }
        for a in agents
    ]


@router.post("/analyze")
def analyze(req: AnalyzeRequest):
    t_req = time.perf_counter()
    try:
        get_client()
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    agent = get_agent(req.agent_id) or get_agent("general")
    if not agent:
        raise HTTPException(status_code=400, detail="Нет конфигурации агентов")

    requirements = load_requirements_text()
    checklist = load_checklist_json()
    system_prompt = agent.get("system_prompt") or "Ты помощник по договорам."
    focus = agent.get("focus_sections") or []

    plain = re.sub(r"<[^>]+>", " ", req.html)
    plain = " ".join(plain.split())[:6000]
    rag_ctx = ""
    t_rag = time.perf_counter()
    if len(plain.strip()) >= 40:
        rag_ctx, nchunks = retrieve_for_query(plain)
        log.info(
            "analyze rag_retrieve elapsed_s=%.3f chunks_in_index=%s rag_chars=%s",
            time.perf_counter() - t_rag,
            nchunks,
            len(rag_ctx),
        )
    else:
        log.info("analyze rag_retrieve skipped (plain text too short)")

    try:
        result = analyze_contract(
            document_html=req.html,
            requirements_context=requirements,
            checklist_context=checklist,
            system_prompt=system_prompt,
            agent_focus=focus,
            rag_context=rag_ctx,
        )
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"Ошибка DeepSeek API: {e!s}"
        ) from e

    log.info(
        "analyze done agent_id=%s total_elapsed_s=%.3f",
        agent["id"],
        time.perf_counter() - t_req,
    )
    return {"agent_id": agent["id"], "result": result}
