from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from threading import Lock

# pyrefly: ignore [missing-import]
import faiss
# pyrefly: ignore [missing-import]
import numpy as np

from .chunk import chunk_text
from .embedding import NvidiaEmbeddingModel


class SQLiteVectorDB:
    """Vector database using SQLite for metadata and FAISS for similarity search."""

    def __init__(self, embedding_model: NvidiaEmbeddingModel, db_path: str) -> None:
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
        if not chunks:
            return
        embeddings = self.embedding_model.embed_batch(chunks)
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

                for index, (chunk_value, emb) in enumerate(zip(chunks, embeddings)):
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
                            json.dumps(emb),
                        ),
                    )
                connection.commit()

    def chunk_document(self, text: str) -> list[str]:
        return chunk_text(text)

    def delete_document(self, tenant_id: str, document_id: str) -> bool:
        with self._lock:
            with self._connect() as connection:
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
        """Search using FAISS for fast, accurate vector similarity."""
        query_embedding = self.embedding_model.embed(query)
        if not query_embedding:
            return []

        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT chunk_id, document_id, tenant_id, filename, text, embedding
                FROM chunks
                WHERE tenant_id = ?
                """,
                (tenant_id,),
            ).fetchall()

        if not rows:
            return []

        # Build FAISS index from stored embeddings
        embeddings_list = []
        valid_rows = []
        for row in rows:
            emb = json.loads(row["embedding"])
            if emb:
                embeddings_list.append(emb)
                valid_rows.append(row)

        if not embeddings_list:
            return []

        dim = len(embeddings_list[0])
        db_matrix = np.array(embeddings_list, dtype=np.float32)
        query_vec = np.array([query_embedding], dtype=np.float32)

        # Normalize for cosine similarity
        faiss.normalize_L2(db_matrix)
        faiss.normalize_L2(query_vec)

        # Build flat inner product index (= cosine similarity after L2 norm)
        index = faiss.IndexFlatIP(dim)
        index.add(db_matrix)

        k = min(top_k, len(valid_rows))
        scores, indices = index.search(query_vec, k)

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0:
                continue
            row = valid_rows[idx]
            results.append(
                {
                    "chunk_id": row["chunk_id"],
                    "document_id": row["document_id"],
                    "tenant_id": row["tenant_id"],
                    "filename": row["filename"],
                    "text": row["text"],
                    "score": round(float(score), 6),
                }
            )

        return results

    def stats(self) -> dict[str, int]:
        with self._connect() as connection:
            docs = connection.execute("SELECT COUNT(*) AS total FROM documents").fetchone()["total"]
            chunks = connection.execute("SELECT COUNT(*) AS total FROM chunks").fetchone()["total"]
        return {"documents": int(docs), "chunks": int(chunks)}

