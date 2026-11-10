"""Application settings, read from environment variables or a .env file.

API keys are never logged or returned by the API.
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(PROJECT_DIR / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    sage_api_key: str = ""
    sage_base_url: str = "https://sage.levanto.ai"
    sage_timeout_s: float = 20.0

    default_model: str = "anthropic/claude-sonnet-5.5"
    summary_model: str = "deepseek/deepseek-v4.1-flash"

    database_url: str = f"sqlite:///{(BACKEND_DIR / 'data' / 'roleplay.db').as_posix()}"
    app_url: str = "http://localhost:5173"
    app_title: str = "Roleplay Harness"


@lru_cache
def get_settings() -> Settings:
    return Settings()
