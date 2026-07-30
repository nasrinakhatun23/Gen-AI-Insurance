from contextlib import asynccontextmanager
import json
import os
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .embedding import SimpleEmbeddingModel
from .llm import generate_answer
from .settings import get_settings
from .vector_db import SQLiteVectorDB
from .pdf_reader import extract_text_from_pdf


class ChatRequest(BaseModel):
    tenant_id: str = Field(default="tenant-alpha")
    query: str
    top_k: int = Field(default=3, ge=1, le=10)


class UploadResult(BaseModel):
    document_id: str
    tenant_id: str
    filename: str
    chunks_indexed: int
    status: str


class SourceChunk(BaseModel):
    chunk_id: str
    document_id: str
    tenant_id: str
    score: float
    text: str


class ChatResponse(BaseModel):
    tenant_id: str
    query: str
    answer: str
    sources: list[SourceChunk]


settings = get_settings()

embedding_model = SimpleEmbeddingModel()
vector_db = SQLiteVectorDB(embedding_model=embedding_model, db_path=settings.db_path)

@asynccontextmanager
async def lifespan(app: FastAPI):
    dataset_path = os.path.join(os.path.dirname(__file__), "data", "dataset.jsonl")
    if os.path.exists(dataset_path):
        with open(dataset_path, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                record = json.loads(line)
                tenant_id = record.get("tenant_id", "tenant-alpha")
                doc_id = record.get("id")
                text = record.get("text", "")
                
                chunks = vector_db.chunk_document(text)
                vector_db.add_document(
                    tenant_id=tenant_id,
                    document_id=doc_id,
                    filename="dataset.jsonl",
                    chunks=chunks,
                )
    yield

app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def resolve_tenant(tenant_id: str, tenant_header: str | None) -> str:
    if tenant_header and tenant_header != tenant_id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    return tenant_header or tenant_id


@app.post("/upload", response_model=UploadResult)
async def upload_document(
    file: UploadFile = File(...),
    tenant_id: str = Form("tenant-alpha"),
    x_tenant_id: str | None = Header(default=None),
) -> UploadResult:
    resolved_tenant = resolve_tenant(tenant_id, x_tenant_id)
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    upload_dir = os.path.join(os.path.dirname(__file__), "data", "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = os.path.join(upload_dir, file.filename)
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    try:
        text = extract_text_from_pdf(file_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not text.strip():
        raise HTTPException(status_code=400, detail="No readable text found in PDF")

    document_id = str(uuid4())
    chunks = vector_db.chunk_document(text)
    
    vector_db.add_document(
        tenant_id=resolved_tenant,
        document_id=document_id,
        filename=file.filename,
        chunks=chunks,
    )

    return UploadResult(
        document_id=document_id,
        tenant_id=resolved_tenant,
        filename=file.filename,
        chunks_indexed=len(chunks),
        status="indexed",
    )


@app.delete("/documents/{document_id}")
def delete_document(
    document_id: str,
    x_tenant_id: str | None = Header(default=None)
) -> dict[str, str]:
    if not x_tenant_id:
        raise HTTPException(status_code=400, detail="x-tenant-id header is required")
        
    deleted = vector_db.delete_document(tenant_id=x_tenant_id, document_id=document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")
        
    return {"status": "deleted", "document_id": document_id}

@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest, x_tenant_id: str | None = Header(default=None)) -> ChatResponse:
    resolved_tenant = resolve_tenant(request.tenant_id, x_tenant_id)
    matches = vector_db.search(tenant_id=resolved_tenant, query=request.query, top_k=request.top_k)
    answer = generate_answer(query=request.query, tenant_id=resolved_tenant, matches=matches)

    sources = [
        SourceChunk(
            chunk_id=match["chunk_id"],
            document_id=match["document_id"],
            tenant_id=match["tenant_id"],
            score=match["score"],
            text=match["text"],
        )
        for match in matches
    ]

    return ChatResponse(
        tenant_id=resolved_tenant,
        query=request.query,
        answer=answer,
        sources=sources,
    )
