from __future__ import annotations


def chunk_text(text: str, chunk_size: int = 900, overlap: int = 150) -> list[str]:
    cleaned = " ".join(text.split())
    if not cleaned:
        return []

    sentences = [sentence.strip() for sentence in cleaned.replace("\n", " ").split(".") if sentence.strip()]
    if not sentences:
        return [cleaned]

    chunks: list[str] = []
    current_chunk = ""

    for sentence in sentences:
        candidate = f"{current_chunk}. {sentence}".strip(". ") if current_chunk else sentence
        if len(candidate) <= chunk_size:
            current_chunk = candidate
            continue

        if current_chunk:
            chunks.append(current_chunk.strip())

        if len(sentence) <= chunk_size:
            current_chunk = sentence
        else:
            start = 0
            while start < len(sentence):
                end = min(start + chunk_size, len(sentence))
                chunks.append(sentence[start:end].strip())
                if end >= len(sentence):
                    break
                start = max(0, end - overlap)
            current_chunk = ""

    if current_chunk:
        chunks.append(current_chunk.strip())

    return [chunk for chunk in chunks if chunk]
