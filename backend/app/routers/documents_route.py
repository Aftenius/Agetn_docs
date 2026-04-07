import logging

from fastapi import APIRouter, HTTPException

from app.schemas import DocumentCreateBody, DocumentPutBody
from app.services import document_storage as ds

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.get("")
def list_documents_route():
    rows = ds.list_documents()
    return {"documents": rows}


@router.get("/{doc_id}")
def get_document_route(doc_id: str):
    row = ds.get_document(doc_id)
    if not row:
        raise HTTPException(status_code=404, detail="Документ не найден")
    return row


@router.post("")
def create_document_route(body: DocumentCreateBody):
    try:
        rec = ds.save_document(
            doc_id=body.id,
            title=body.title,
            html=body.html,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    log.info("documents.create id=%s", body.id)
    return rec


@router.put("/{doc_id}")
def put_document_route(doc_id: str, body: DocumentPutBody):
    cur = ds.get_document(doc_id)
    if not cur:
        raise HTTPException(status_code=404, detail="Документ не найден")
    title = body.title if body.title is not None else str(cur.get("title", ""))
    html = body.html if body.html is not None else str(cur.get("html", ""))
    try:
        rec = ds.save_document(doc_id=doc_id, title=title, html=html)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return rec


@router.delete("/{doc_id}")
def delete_document_route(doc_id: str):
    if not ds.delete_document(doc_id):
        raise HTTPException(status_code=404, detail="Документ не найден")
    return {"ok": True, "id": doc_id}
