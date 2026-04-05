from fastapi import APIRouter, HTTPException, Response

from app.schemas import ExportRequest
from app.services.export_docx import html_to_docx_bytes
from app.services.export_pdf import html_to_pdf_bytes

router = APIRouter(prefix="/api/export", tags=["export"])


@router.post("/docx")
def export_docx(req: ExportRequest):
    try:
        data = html_to_docx_bytes(req.html)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DOCX: {e!s}") from e
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="dogovor.docx"'},
    )


@router.post("/pdf")
def export_pdf(req: ExportRequest):
    try:
        data = html_to_pdf_bytes(req.html)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"PDF (нужен Chromium: playwright install chromium): {e!s}",
        ) from e
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="dogovor.pdf"'},
    )
