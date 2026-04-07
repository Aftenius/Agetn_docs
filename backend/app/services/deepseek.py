import json
import logging
import re
import time
from typing import Any

from openai import OpenAI

from app.config import deepseek_api_key, deepseek_base_url, deepseek_model

log = logging.getLogger(__name__)


def get_client() -> OpenAI:
    return OpenAI(
        api_key=deepseek_api_key(),
        base_url=deepseek_base_url(),
    )


def _usage_payload(completion: Any) -> dict[str, Any] | None:
    u = getattr(completion, "usage", None)
    if u is None:
        return None
    if hasattr(u, "model_dump"):
        try:
            return u.model_dump()
        except Exception:
            pass
    pt = getattr(u, "prompt_tokens", None)
    ct = getattr(u, "completion_tokens", None)
    tt = getattr(u, "total_tokens", None)
    if pt is None and ct is None and tt is None:
        return None
    return {
        "prompt_tokens": pt,
        "completion_tokens": ct,
        "total_tokens": tt,
    }


def _chat_completion(
    *,
    operation: str,
    client: OpenAI,
    **kwargs: Any,
) -> Any:
    model = kwargs.get("model") or deepseek_model()
    t0 = time.perf_counter()
    try:
        completion = client.chat.completions.create(**kwargs)
    except Exception as e:
        elapsed = time.perf_counter() - t0
        log.warning(
            "deepseek.%s FAILED model=%s elapsed_s=%.3f err=%s",
            operation,
            model,
            elapsed,
            e,
        )
        raise
    elapsed = time.perf_counter() - t0
    log.info(
        "deepseek.%s model=%s elapsed_s=%.3f usage=%s",
        operation,
        model,
        elapsed,
        _usage_payload(completion),
    )
    return completion


# Общие правила как в templates/contracts/*.html.j2 и docs/шаблон договора.docx
CONTRACT_HTML_LAYOUT_RULES = """
ЖЁСТКО соблюдай визуальную структуру корпоративного шаблона:
1) Самый первый элемент документа — один <h1> с атрибутом style="text-align: center".
   Текст заголовка ОБЯЗАН содержать «Договор» и «№» (например: «Договор поставки № [уточнить: номер]»,
   «Договор оказания услуг № [уточнить: номер]» или кратко «Договор № [уточнить: номер]», если тип из контекста неясен).
2) Сразу после <h1> — отбивка: <p><br></p>.
3) Строка города и даты ОДНИМ абзацем, как в шаблоне: 
   <p><strong>г. [уточнить: город]</strong> «[уточнить: дата]»</p>
4) После пункта 3 — одна отбивка <p><br></p>, затем БЕЗ таблицы реквизитов: сразу пронумерованные разделы <h2> «1. …», «2. …» и основной текст.
5) Текст договора — разделы <h2> с нумерацией, как в шаблоне, до заключительного раздела включительно.
6) Таблица реквизитов сторон — ТОЛЬКО В КОНЦЕ текста, после всех разделов <h2>, но ПЕРЕД таблицей подписей:
   две колонки: слева Заказчик/Поставщик, справа Исполнитель/Покупатель (исполнитель всегда в правой ячейке для услуг).
   Формат: <table><tbody><tr><td><p><strong>…</strong> …</p></td><td><p><strong>…</strong> …</p></td></tr></tbody></table>
   Не помещай реквизиты в начало документа (не после даты).
7) Самый низ — таблица подписей сторон (две колонки).
Допустимые теги: <h1>, <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <br>, <table>, <tbody>, <thead>, <tr>, <th>, <td>.
Не используй <html>, <body>, <style>, class (кроме как указано style у первого h1 при необходимости center).
"""


def analyze_contract(
    *,
    document_html: str,
    requirements_context: str,
    checklist_context: str,
    system_prompt: str,
    agent_focus: list[str] | None = None,
    max_chars: int = 48_000,
    rag_context: str = "",
) -> dict[str, Any]:
    text = re.sub(r"<[^>]+>", " ", document_html)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_chars:
        text = text[:max_chars] + "\n\n[... текст обрезан для API ...]"

    focus = ""
    if agent_focus:
        focus = "Фокус проверки (приоритет): " + "; ".join(agent_focus) + "\n\n"

    rag_part = ""
    if rag_context.strip():
        rag_part = f"""
Фрагменты из корпуса (каждый с меткой [имя_файла#номер] в первой строке — используй эти метки при ссылке на опору):
---
{rag_context[:8000]}
---

"""

    user_content = f"""{focus}Ниже внутренние требования компании к оформлению договоров (контекст):
---
{requirements_context[:24_000]}
---

Структурированный чек-лист (JSON):
{checklist_context[:24_000]}

---
{rag_part}
Текст договора для анализа (извлечён из HTML редактора):
---
{text}
---

Верни ТОЛЬКО валидный JSON без markdown и без пояснений вне JSON, со схемой:
{{
  "summary": "краткое резюме для делового пользователя на русском",
  "missing": [{{"item": "что отсутствует или неясно", "severity": "high|medium|low", "quote": "дословный фрагмент из договора (20-120 символов) для перехода к месту в тексте; иначе пустая строка"}}],
  "warnings": [{{"item": "риск или спорная формулировка", "severity": "high|medium|low", "quote": "фрагмент из договора или пусто"}}],
  "suggestions": [{{"item": "как улучшить оформление", "reference": "опционально пункт чек-листа", "quote": "фрагмент из договора или пусто"}}],
  "checklist_passed": [{{"id": "строка", "label": "пункт", "passed": true|false, "note": "кратко", "quote": "фрагмент текста при необходимости, иначе пусто"}}],
  "red_flags": ["условия из красных флагов требований"],
  "do_not_disclose_to_client": [{{"item": "что нельзя передавать заказчику (внутреннее, компрометирующее)", "quote": "дословный фрагмент из договора, если есть в тексте"}}],
  "rag_sources_used": ["file.pdf#0", "guide.docx#1"]
}}
Поле do_not_disclose_to_client — только то, что категорически нельзя показать контрагенту; каждый пункт с item и по возможности quote из текста.
Поле rag_sources_used: если в запросе выше есть блок фрагментов корпуса — перечисли метки (строки вида имя_файла.ext#N), которые реально учитывал; метки копируй как в квадратных скобках у фрагментов. Если фрагментов корпуса не было или они не использовались — [].
checklist_passed: id — slug латиницей из label. Оцени passed честно.
Для полей quote копируй текст из договора посимвольно (как в извлечённом тексте выше), чтобы поиск в редакторе сработал."""

    client = get_client()
    try:
        completion = _chat_completion(
            operation="analyze_contract_json",
            client=client,
            model=deepseek_model(),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.3,
            response_format={"type": "json_object"},
        )
    except Exception:
        log.info("deepseek.analyze_contract retry without response_format=json_object")
        completion = _chat_completion(
            operation="analyze_contract_plain",
            client=client,
            model=deepseek_model(),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.3,
        )
    raw = completion.choices[0].message.content or "{}"
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```\w*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", raw)
        if m:
            return json.loads(m.group())
        raise


def generate_contract_structure(
    *,
    title: str,
    subject: str,
    template_html_snippet: str,
    requirements_context: str,
    organization_context: str = "",
    rag_context: str = "",
) -> str:
    template_part = ""
    if template_html_snippet.strip():
        template_part = (
            "\nФрагмент шаблона из docs/шаблон договора.docx (соблюдай порядок блоков и отступы; "
            "реквизиты не копируй дословно):\n---\n"
            f"{template_html_snippet[:24_000]}\n---\n"
        )

    org_part = ""
    if organization_context.strip():
        org_part = (
            "\nНастройки организации (структура, юрисдикция, пожелания):\n"
            f"{organization_context[:6000]}\n"
        )
    rag_part = ""
    if rag_context.strip():
        rag_part = (
            "\nРелевантные фрагменты корпуса (в начале каждого фрагмента метка [имя_файла#N]; ориентиры формулировок, не копировать дословно без проверки).\n"
            "Если опираешься на фрагмент при формулировке раздела, в конце этого раздела (перед следующим <h2>) добавь абзац:\n"
            "<p><em>Опора корпуса:</em> перечисли через запятую соответствующие метки в квадратных скобках, например [sample.pdf#0], [guide.docx#2].</p>\n"
            "Если корпус не использовался для раздела — такой строки в разделе не добавляй.\n"
            f"---\n{rag_context[:12000]}\n---\n"
        )

    user_content = f"""Имя документа в библиотеке (справочно, не подставляй как единственный заголовок): {title}

Суть договора (от пользователя — тип сделки, стороны, предмет):
{subject}
{template_part}
{org_part}
{rag_part}
{CONTRACT_HTML_LAYOUT_RULES}
Ключевые внутренние требования к оформлению (сжато):
{requirements_context[:8000]}

Сформируй полную структуру договора на русском для HTML-редактора: шапка по правилам выше, пронумерованные <h2>,
в тексте плейсхолдеры [уточнить: …]. Где уместно — списки <ul>/<li>.
В конце: <p><em>Черновик структуры для правки юристом.</em></p>"""

    client = get_client()
    completion = _chat_completion(
        operation="generate_contract_structure",
        client=client,
        model=deepseek_model(),
        messages=[
            {
                "role": "system",
                "content": (
                    "Ты помощник по составлению договоров РФ. Отвечай только HTML-фрагментом, "
                    "без markdown и без преамбулы. Первый блок документа — центрированный заголовок «Договор … №» и "
                    "шапка как в типовом шаблоне (город, дата, стороны)."
                ),
            },
            {"role": "user", "content": user_content},
        ],
        temperature=0.35,
    )
    html = completion.choices[0].message.content or "<p>Пустой ответ модели.</p>"
    html = html.strip()
    if html.startswith("```"):
        html = re.sub(r"^```\w*\n?", "", html)
        html = re.sub(r"\n?```$", "", html)
    return html


def generate_draft(
    *,
    filled_fields: dict[str, Any],
    template_body: str,
    example_snippet: str | None,
    contract_type: str,
    requirements_context: str,
    organization_context: str = "",
) -> str:
    example_part = ""
    if example_snippet:
        example_part = f"\nФрагмент/структура примера договора (контекст, не копировать дословно юр. реквизиты):\n---\n{example_snippet[:12_000]}\n---\n"

    org_part = ""
    if organization_context.strip():
        org_part = (
            f"\nНастройки организации:\n{organization_context[:4000]}\n"
        )

    user_content = f"""Тип договора: {contract_type}

Заполненные поля мастера (JSON):
{json.dumps(filled_fields, ensure_ascii=False, indent=2)}

Шаблон-заготовка (Jinja уже частично применён ниже — можешь опереться на структуру):
---
{template_body[:16_000]}
---
{example_part}
{org_part}
Ключевые внутренние требования (сжато, для соблюдения при написании):
{requirements_context[:8000]}

{CONTRACT_HTML_LAYOUT_RULES}

Сформируй черновик договора на русском для HTML-редактора. Реквизиты и суммы — из полей мастера JSON выше.
Шапка договора (центрированный <h1> с «Договор… №», отбивки, строка «г. город «дата»», стороны) должна строго
соответствовать правилам вёрстки. Разделы пронумерованы как в шаблоне. Таблицу подписей в конце выводи, если она есть в шаблоне.
В конце: <p><em>Черновик для правки юристом.</em></p>"""

    client = get_client()
    completion = _chat_completion(
        operation="generate_draft",
        client=client,
        model=deepseek_model(),
        messages=[
            {
                "role": "system",
                "content": "Ты помощник по составлению договоров РФ. Отвечай только HTML-фрагментом без обёртки markdown.",
            },
            {"role": "user", "content": user_content},
        ],
        temperature=0.4,
    )
    html = completion.choices[0].message.content or "<p>Пустой ответ модели.</p>"
    html = html.strip()
    if html.startswith("```"):
        html = re.sub(r"^```\w*\n?", "", html)
        html = re.sub(r"\n?```$", "", html)
    return html
