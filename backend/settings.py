from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_name: str
    app_version: str
    db_path: str
    cors_origins: list[str]


def _parse_origins(value: str) -> list[str]:
    origins = [item.strip() for item in value.split(",") if item.strip()]
    return origins or ["http://localhost:5173", "http://127.0.0.1:5173"]


from pathlib import Path


def get_settings() -> Settings:
    default_origins = "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173"
    base_dir = Path(__file__).resolve().parent
    default_db_path = str(base_dir / "data" / "rag.db")
    return Settings(
        app_name=os.getenv("RAG_APP_NAME", "Insurance RAG Backend"),
        app_version=os.getenv("RAG_APP_VERSION", "1.1.0"),
        db_path=os.getenv("RAG_DB_PATH", default_db_path),
        cors_origins=_parse_origins(os.getenv("RAG_CORS_ORIGINS", default_origins)),
    )

