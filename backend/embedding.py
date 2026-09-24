from __future__ import annotations

# pyrefly: ignore [missing-import]
from openai import OpenAI

NVIDIA_EMBED_MODEL = "nvidia/nemotron-3-embed-1b"
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"


class NvidiaEmbeddingModel:
    """Real AI embedding model using NVIDIA NIM nv-embedqa-e5-v5."""

    def __init__(self, api_key: str) -> None:
        if not api_key:
            raise ValueError(
                "NVIDIA_API_KEY is missing. Please set it in backend/.env file."
            )
        self._client = OpenAI(
            base_url=NVIDIA_BASE_URL,
            api_key=api_key,
        )

    def embed(self, text: str, input_type: str = "query") -> list[float]:
        """Generate a real AI embedding vector for a single text string."""
        text = text.replace("\n", " ").strip()
        if not text:
            return []
        response = self._client.embeddings.create(
            input=[text],
            model=NVIDIA_EMBED_MODEL,
            encoding_format="float",
            extra_body={"input_type": input_type, "truncate": "END"},
        )
        return response.data[0].embedding

    def embed_batch(self, texts: list[str], batch_size: int = 50) -> list[list[float]]:
        """Embed a list of text chunks in batches using a single API call per batch."""
        if not texts:
            return []
        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), batch_size):
            batch = [t.replace("\n", " ").strip() or "empty" for t in texts[i : i + batch_size]]
            response = self._client.embeddings.create(
                input=batch,
                model=NVIDIA_EMBED_MODEL,
                encoding_format="float",
                extra_body={"input_type": "passage", "truncate": "END"},
            )
            all_embeddings.extend([item.embedding for item in response.data])
        return all_embeddings
