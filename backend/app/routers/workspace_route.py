import logging
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from app.schemas import (
    AGENT_ID_PATTERN,
    ChecklistPutBody,
    WorkspaceAgentUpsert,
    WorkspaceSettingsPatch,
)
from app.services import workspace as ws
from app.services.agents_loader import (
    agent_workspace_file_exists,
    builtin_agent_ids,
    delete_workspace_agent_file,
    load_agents,
    save_workspace_agent,
)
from app.services.requirements_loader import checklist_api_dict, save_workspace_checklist_json
from app.services.rag_service import (
    clear_all_chunks,
    delete_chunks_by_source,
    ingest_file,
    rag_status,
)
from app.services.workspace import invalidate_caches_after_settings_change, rag_inbox_dir

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/workspace", tags=["workspace"])

# Маршруты без path-параметров — первыми (избегаем коллизий с /agents/{agent_id}).


@router.get("/settings")
def get_workspace_settings():
    ws.ensure_workspace_dirs()
    data = ws.load_settings_dict()
    return {
        **data,
        "workspace_root": str(ws.get_workspace_root()),
    }


@router.patch("/settings")
def patch_workspace_settings(body: WorkspaceSettingsPatch):
    cur = ws.load_settings_dict()
    patch = body.model_dump(exclude_unset=True)
    if "generation" in patch and patch["generation"] is not None:
        gen_patch = {k: v for k, v in patch["generation"].items() if v is not None}
        gen = cur.get("generation")
        if not isinstance(gen, dict):
            gen = {}
            cur["generation"] = gen
        if gen_patch:
            gen.update(gen_patch)
        del patch["generation"]
    for key, val in patch.items():
        if val is not None:
            cur[key] = val
    ws.save_settings_dict(cur)
    invalidate_caches_after_settings_change()
    from app.routers.generate import reset_jinja_env

    reset_jinja_env()
    return get_workspace_settings()


@router.get("/rag/status")
def rag_status_route():
    return rag_status()


@router.post("/rag/ingest")
async def rag_ingest_route(file: UploadFile = File(...)):
    ws.ensure_workspace_dirs()
    raw_name = file.filename or "upload.dat"
    safe = Path(raw_name).name
    if not safe or safe in (".", ".."):
        raise HTTPException(status_code=400, detail="Некорректное имя файла")
    suffix = Path(safe).suffix.lower()
    if suffix not in (".pdf", ".docx", ".txt"):
        raise HTTPException(
            status_code=400,
            detail="Поддерживаются файлы .pdf, .docx, .txt",
        )
    inbox = rag_inbox_dir()
    inbox.mkdir(parents=True, exist_ok=True)
    dest = inbox / safe
    try:
        dest.write_bytes(await file.read())
    except OSError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    n = ingest_file(dest, original_name=safe)
    log.info("workspace.rag.ingest file=%s chunks_added=%s", safe, n)
    return {"filename": safe, "chunks_added": n}


@router.delete("/rag/source")
def rag_delete_source_route(
    name: str = Query(..., min_length=1, description="Имя файла как в индексе (как при загрузке)"),
):
    n = delete_chunks_by_source(name)
    if n == 0:
        raise HTTPException(
            status_code=404,
            detail="Источник не найден в индексе (проверьте имя файла в списке корпуса)",
        )
    log.info("workspace.rag.delete_source name=%s chunks_removed=%s", name, n)
    return {"ok": True, "source": name, "chunks_removed": n}


@router.post("/rag/clear")
def rag_clear_route():
    n = clear_all_chunks()
    log.info("workspace.rag.clear chunks_removed=%s", n)
    return {"ok": True, "chunks_removed": n}


@router.get("/checklist")
def get_workspace_checklist():
    ws.ensure_workspace_dirs()
    return checklist_api_dict()


@router.put("/checklist")
def put_workspace_checklist(body: ChecklistPutBody):
    ws.ensure_workspace_dirs()
    try:
        save_workspace_checklist_json([x.model_dump() for x in body.items])
    except OSError as e:
        log.exception("workspace.checklist.save")
        raise HTTPException(
            status_code=500,
            detail=f"Не удалось записать checklist.json: {e}",
        ) from e
    invalidate_caches_after_settings_change()
    log.info("workspace.checklist.put items=%s", len(body.items))
    return checklist_api_dict()


@router.get("/agents")
def list_workspace_agents_detail():
    ws.ensure_workspace_dirs()
    agents = load_agents()
    built_in = builtin_agent_ids()
    out: list[dict] = []
    for a in sorted(agents, key=lambda x: str(x.get("id", "")).lower()):
        aid = str(a["id"])
        out.append(
            {
                "id": aid,
                "name": a.get("name", aid),
                "focus_sections": a.get("focus_sections") or [],
                "system_prompt": a.get("system_prompt") or "",
                "source": "workspace"
                if agent_workspace_file_exists(aid)
                else "builtin",
                "has_builtin": aid in built_in,
            }
        )
    return out


@router.put("/agents/{agent_id}")
def put_workspace_agent(agent_id: str, body: WorkspaceAgentUpsert):
    path_id = agent_id.strip()
    if not AGENT_ID_PATTERN.match(path_id):
        raise HTTPException(
            status_code=400,
            detail="Некорректный id в адресе: только латиница, цифры, _ и - (как имя файла без расширения).",
        )
    if path_id != body.id:
        raise HTTPException(
            status_code=400,
            detail="Параметр id в URL и поле id в теле запроса должны совпадать",
        )
    root = ws.get_workspace_root()
    target = root / "agents" / f"{path_id}.yaml"
    log.info(
        "workspace.agent.put id=%s workspace_root=%s target_file=%s",
        path_id,
        root,
        target,
    )
    try:
        save_workspace_agent(body.model_dump())
    except OSError as e:
        log.exception("workspace.agent.save failed id=%s", path_id)
        raise HTTPException(
            status_code=500,
            detail=f"Не удалось записать файл агента (права доступа или диск): {e}",
        ) from e
    invalidate_caches_after_settings_change()
    log.info("workspace.agent.put ok id=%s", path_id)
    return {"ok": True, "id": body.id, "path": str(target)}


@router.delete("/agents/{agent_id}")
def delete_workspace_agent_route(agent_id: str):
    if not AGENT_ID_PATTERN.match(agent_id):
        raise HTTPException(
            status_code=400,
            detail="Некорректный идентификатор агента",
        )
    if not delete_workspace_agent_file(agent_id):
        raise HTTPException(
            status_code=404,
            detail="Файл агента в workspace не найден",
        )
    invalidate_caches_after_settings_change()
    return {
        "ok": True,
        "message": "Переопределение в workspace удалено. Если есть встроенный агент с этим id, снова используется он.",
    }
