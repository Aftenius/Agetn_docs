from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query

from app.services.money_ru import amount_in_words_rubles

router = APIRouter(prefix="/api", tags=["util"])


@router.get("/amount-in-words")
def amount_in_words_route(
    value: str = Query(..., min_length=1, max_length=64, description="Число, например 69000000 или 69000000.50"),
):
    try:
        d = Decimal(value.replace(",", ".").replace(" ", ""))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Некорректное число: {e!s}") from e
    text = amount_in_words_rubles(d)
    if not text:
        raise HTTPException(status_code=400, detail="Не удалось преобразовать сумму")
    return {"value": str(d), "words": text}
