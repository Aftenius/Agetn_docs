# Docs-agent

Платформа для черновиков и проверки договоров: редактор в браузере, генерация структуры через LLM, экспорт, настраиваемый **workspace** (шаблоны, агенты, требования) и опциональный **RAG** по корпусу договоров.

## Авторство и лицензия

- Автор: [Aftenius](https://github.com/Aftenius) — см. [AUTHORS](AUTHORS).
- Условия использования и распространения: см. [LICENSE](LICENSE).
- При использовании или форке сохраняйте уведомление об авторских правах из `LICENSE` и актуальный список в [AUTHORS](AUTHORS).
- Код в репозитории — **движок**; **компанейские и конфиденциальные данные** (договоры, чек-листы, ключи API) не должны коммититься: используйте каталог workspace (см. ниже) и [`.env.example`](.env.example).

## Workspace (данные организации)

Путь задаётся переменной окружения `DOCS_AGENT_WORKSPACE` (абсолютный путь). Если не задана, используется `data/workspace/default` в корне проекта (типично в `.gitignore`).

Структура:

- `settings.yaml` — название компании и инструкции по структуре генерации
- `requirements.md`, `checklist.json` или DOCX чек-листа, шаблон договора DOCX
- `templates/contracts/*.j2` — Jinja-шаблоны
- `agents/*.yaml` — профили агентов проверки
- `samples/` — примеры для мастера (аналог старой папки `docs/`)
- `rag/inbox/` — загружаемые файлы для индексации
- `rag_index/` — локальный индекс RAG (SQLite)

Скелет без секретов: [data/workspace/.example/](data/workspace/.example/).

## Запуск

- Backend: Python 3.10+, `pip install -r requirements.txt`, из каталога `backend`: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
- Frontend: `cd frontend && npm install && npm run dev`
- Docker: см. `docker-compose.yml`

Переменные: скопируйте `.env.example` в `.env`, задайте `DEEPSEEK_API_KEY`. Для эмбеддингов RAG (опционально): `EMBEDDING_API_KEY`, `EMBEDDING_BASE_URL`, `EMBEDDING_MODEL`.

## API (выборочно)

- `GET/PATCH /api/workspace/settings` — настройки workspace
- `POST /api/workspace/rag/ingest` — загрузка файла в корпус RAG
- `GET /api/workspace/rag/status` — краткий статус индекса

## Отказ от ответственности

Инструмент не заменяет юридическую экспертизу. Черновики и подсказки ИИ требуют проверки квалифицированным специалистом.
