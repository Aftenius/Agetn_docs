import io

import mammoth
from fastapi import APIRouter, File, HTTPException, UploadFile

router = APIRouter(prefix="/api/import", tags=["import"])


@router.post("/docx")
async def import_docx(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise HTTPException(status_code=400, detail="Ожидается файл .docx")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Пустой файл")
    try:
        result = mammoth.convert_to_html(io.BytesIO(data))
        return {"html": result.value or "<p>(Пустой документ)</p>"}
    except Exception as e:
        raise HTTPException(
            status_code=422, detail=f"Не удалось разобрать DOCX: {e!s}"
        ) from e
