from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from threading import Lock

from .chunk import chunk_text
from .embedding import SimpleEmbeddingModel


class SQLiteVectorDB:
    def __init__(self, embedding_model: SimpleEmbeddingModel, db_path: str) -> None:
        self.embedding_model = embedding_model
        self.db_path = db_path
        self._lock = Lock()

        path = Path(db_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS documents (
                    document_id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    chunks_indexed INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS chunks (
                    chunk_id TEXT PRIMARY KEY,
                    document_id TEXT NOT NULL,
                    tenant_id TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    text TEXT NOT NULL,
                    embedding TEXT NOT NULL,
                    FOREIGN KEY(document_id) REFERENCES documents(document_id)
                )
                """
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id)"
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_chunks_tenant ON chunks(tenant_id)"
            )
            connection.commit()

    def add_document(self, tenant_id: str, document_id: str, filename: str, chunks: list[str]) -> None:
        with self._lock:
            with self._connect() as connection:
                connection.execute("DELETE FROM chunks WHERE document_id = ?", (document_id,))
                connection.execute(
                    """
                    INSERT INTO documents(document_id, tenant_id, filename, chunks_indexed, status)
                    VALUES(?, ?, ?, ?, ?)
                    ON CONFLICT(document_id) DO UPDATE SET
                        tenant_id = excluded.tenant_id,
                        filename = excluded.filename,
                        chunks_indexed = excluded.chunks_indexed,
                        status = excluded.status
                    """,
                    (document_id, tenant_id, filename, len(chunks), "indexed"),
                )

                for index, chunk_value in enumerate(chunks):
                    connection.execute(
                        """
                        INSERT INTO chunks(chunk_id, document_id, tenant_id, filename, text, embedding)
                        VALUES(?, ?, ?, ?, ?, ?)
                        """,
                        (
                            f"{document_id}-chunk-{index + 1}",
                            document_id,
                            tenant_id,
                            filename,
                            chunk_value,
                            json.dumps(self.embedding_model.embed(chunk_value)),
                        ),
                    )
                connection.commit()

    def chunk_document(self, text: str) -> list[str]:
        return chunk_text(text)

    def delete_document(self, tenant_id: str, document_id: str) -> bool:
        with self._lock:
            with self._connect() as connection:
                # Check if document exists for this tenant
                row = connection.execute(
                    "SELECT document_id FROM documents WHERE tenant_id = ? AND document_id = ?",
                    (tenant_id, document_id)
                ).fetchone()
                
                if not row:
                    return False
                    
                connection.execute("DELETE FROM chunks WHERE tenant_id = ? AND document_id = ?", (tenant_id, document_id))
                connection.execute("DELETE FROM documents WHERE tenant_id = ? AND document_id = ?", (tenant_id, document_id))
                connection.commit()
                return True

    def list_documents(self, tenant_id: str | None = None) -> list[dict[str, object]]:
        query = """
            SELECT document_id, tenant_id, filename, chunks_indexed, status, created_at
            FROM documents
        """
        params: tuple[object, ...] = ()

        if tenant_id is not None:
            query += " WHERE tenant_id = ?"
            params = (tenant_id,)

        query += " ORDER BY created_at DESC"

        with self._connect() as connection:
            rows = connection.execute(query, params).fetchall()

        return [dict(row) for row in rows]

    def search(self, tenant_id: str, query: str, top_k: int = 3) -> list[dict[str, object]]:
        query_embedding = self.embedding_model.embed(query)
        matches: list[dict[str, object]] = []

        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT chunk_id, document_id, tenant_id, filename, text, embedding
                FROM chunks
                WHERE tenant_id = ?
                """,
                (tenant_id,),
            ).fetchall()

        for row in rows:
            chunk_embedding = json.loads(row["embedding"])
            score = self._cosine_similarity(query_embedding, chunk_embedding)
            matches.append(
                {
                    "chunk_id": row["chunk_id"],
                    "document_id": row["document_id"],
                    "tenant_id": row["tenant_id"],
                    "filename": row["filename"],
                    "text": row["text"],
                    "score": round(score, 6),
                }
            )

        matches.sort(key=lambda item: item["score"], reverse=True)
        return matches[:top_k]

    @staticmethod
    def _cosine_similarity(left: list[float], right: list[float]) -> float:
        if not left or not right:
            return 0.0

        dot_product = sum(a * b for a, b in zip(left, right))
        left_norm = sum(value * value for value in left) ** 0.5
        right_norm = sum(value * value for value in right) ** 0.5

        if left_norm == 0 or right_norm == 0:
            return 0.0

        return dot_product / (left_norm * right_norm)

    def stats(self) -> dict[str, int]:
        with self._connect() as connection:
            docs = connection.execute("SELECT COUNT(*) AS total FROM documents").fetchone()["total"]
            chunks = connection.execute("SELECT COUNT(*) AS total FROM chunks").fetchone()["total"]
        return {"documents": int(docs), "chunks": int(chunks)}
