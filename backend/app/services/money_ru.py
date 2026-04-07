"""Рублёвые суммы прописью (рус.) и разбор процента графика оплаты."""

from __future__ import annotations

import re
from decimal import Decimal, ROUND_HALF_UP

_ONES = (
    "",
    "один",
    "два",
    "три",
    "четыре",
    "пять",
    "шесть",
    "семь",
    "восемь",
    "девять",
)
_TEENS = (
    "десять",
    "одиннадцать",
    "двенадцать",
    "тринадцать",
    "четырнадцать",
    "пятнадцать",
    "шестнадцать",
    "семнадцать",
    "восемнадцать",
    "девятнадцать",
)
_TENS = (
    "",
    "",
    "двадцать",
    "тридцать",
    "сорок",
    "пятьдесят",
    "шестьдесят",
    "семьдесят",
    "восемьдесят",
    "девяносто",
)
_HUNDREDS = (
    "",
    "сто",
    "двести",
    "триста",
    "четыреста",
    "пятьсот",
    "шестьсот",
    "семьсот",
    "восемьсот",
    "девятьсот",
)


def _triplet(n: int, feminine: bool = False) -> str:
    if n < 0 or n > 999:
        return ""
    parts: list[str] = []
    h, t, o = n // 100, (n % 100) // 10, n % 10
    if h:
        parts.append(_HUNDREDS[h])
    if t == 1:
        parts.append(_TEENS[o])
    else:
        if t:
            parts.append(_TENS[t])
        if o:
            if feminine and o == 1:
                parts.append("одна")
            elif feminine and o == 2:
                parts.append("две")
            else:
                parts.append(_ONES[o])
    return " ".join(parts)


def _scale_word(scale: int, n: int) -> str:
    if scale == 1:
        if 10 <= n % 100 <= 19:
            return "тысяч"
        if n % 10 == 1:
            return "тысяча"
        if 2 <= n % 10 <= 4:
            return "тысячи"
        return "тыс."
    if scale == 2:
        if 10 <= n % 100 <= 19:
            return "миллионов"
        if n % 10 == 1:
            return "миллион"
        if 2 <= n % 10 <= 4:
            return "миллиона"
        return "миллионов"
    if scale == 3:
        if 10 <= n % 100 <= 19:
            return "миллиардов"
        if n % 10 == 1:
            return "миллиард"
        if 2 <= n % 10 <= 4:
            return "миллиарда"
        return "миллиардов"
    return ""


def _integer_to_words(n: int) -> str:
    if n == 0:
        return "ноль"
    if n < 0:
        return "минус " + _integer_to_words(-n)
    chunks: list[str] = []
    scale = 0
    while n > 0:
        tri = n % 1000
        if tri:
            fem = scale == 1
            w = _triplet(tri, feminine=fem)
            sw = _scale_word(scale, tri)
            if sw:
                chunks.append(f"{w} {sw}".strip())
            else:
                chunks.append(w)
        n //= 1000
        scale += 1
    return " ".join(reversed(chunks)).strip()


def amount_in_words_rubles(amount: Decimal | float | int | str | None) -> str:
    """Формат: «1 234 567 (Один миллион …) рублей»; с копейками — «… 50 копеек»."""
    if amount is None:
        return ""
    try:
        d = Decimal(str(amount).replace(",", ".").replace(" ", ""))
    except Exception:
        return ""
    d = d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    whole = int(d)
    frac = int((d * 100) % 100)
    words = _integer_to_words(whole).capitalize()
    num = f"{whole:,}".replace(",", " ")
    rub = f"{num} ({words}) {_rubles_form(whole)}"
    if frac:
        kw = _integer_to_words(frac).capitalize()
        rub += f" {frac:02d} коп. ({kw} {_kop_form(frac)})"
    return rub


def _rubles_form(n: int) -> str:
    n = abs(n) % 100
    if 11 <= n <= 19:
        return "рублей"
    x = n % 10
    if x == 1:
        return "рубль"
    if 2 <= x <= 4:
        return "рубля"
    return "рублей"


def _kop_form(n: int) -> str:
    n = abs(n) % 100
    if 11 <= n <= 19:
        return "копеек"
    x = n % 10
    if x == 1:
        return "копейка"
    if 2 <= x <= 4:
        return "копейки"
    return "копеек"


def parse_percentages(text: str) -> list[int]:
    """Извлечь целые проценты из строки, по порядку (например «30% аванс, 40% …»)."""
    if not text:
        return []
    found = re.findall(r"(\d{1,3})\s*%", text)
    out: list[int] = []
    for s in found:
        v = int(s)
        if 0 < v <= 100:
            out.append(v)
    return out


def payment_schedule_breakdown_rubles(
    total: Decimal | None,
    schedule_description: str,
    *,
    words_fn=amount_in_words_rubles,
) -> str:
    """Строки «N% = X руб. (пропись)» если известна сумма и есть проценты в тексте."""
    if total is None or schedule_description is None:
        return ""
    try:
        t = Decimal(str(total).replace(",", ".").replace(" ", ""))
    except Exception:
        return ""
    if t <= 0:
        return ""
    percents = parse_percentages(schedule_description)
    if not percents:
        return ""
    lines: list[str] = ["Расчёт этапов оплаты (строго по долям; НЕ выдумывать другие суммы):"]
    for p in percents:
        part = (t * Decimal(p) / Decimal(100)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        w = words_fn(int(part))
        lines.append(f"  — {p}% от цены договора = {part} руб. ({w}).")
    return "\n".join(lines)
