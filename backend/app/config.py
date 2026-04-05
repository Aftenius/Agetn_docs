import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_REPO_ROOT / ".env")


@lru_cache
def get_repo_root() -> Path:
    return _REPO_ROOT


def deepseek_api_key() -> str:
    key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not key:
        raise ValueError(
            "DEEPSEEK_API_KEY не задан. Скопируйте .env.example в .env и укажите ключ."
        )
    return key


def deepseek_base_url() -> str:
    return os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")


def deepseek_model() -> str:
    return os.getenv("DEEPSEEK_MODEL", "deepseek-chat")


def embedding_api_key() -> str | None:
    k = os.getenv("EMBEDDING_API_KEY", "").strip()
    return k or None


def embedding_base_url() -> str:
    u = os.getenv("EMBEDDING_BASE_URL", "").strip()
    return (u or "https://api.openai.com/v1").rstrip("/")


def embedding_model() -> str:
    return os.getenv("EMBEDDING_MODEL", "text-embedding-3-small").strip() or "text-embedding-3-small"
