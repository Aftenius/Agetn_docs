from fastapi import APIRouter

from app.services.docs_scanner import list_doc_samples

router = APIRouter(prefix="/api", tags=["docs"])


@router.get("/doc-samples")
def doc_samples():
    return {"samples": list_doc_samples()}
