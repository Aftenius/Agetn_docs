"""Запуск API: из корня репозитория выполните:

  cd backend && python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

Фронтенд: cd frontend && npm install && npm run dev
Перед экспортом PDF (локально): playwright install chromium

Docker: docker compose up --build  →  http://localhost:8000
"""


def main():
    print(__doc__)


if __name__ == "__main__":
    main()
