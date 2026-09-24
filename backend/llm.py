from __future__ import annotations

# pyrefly: ignore [missing-import]
from openai import OpenAI, APIError, APITimeoutError

NVIDIA_LLM_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"

SYSTEM_PROMPT = """You are an expert Insurance Policy Assistant.

Your ONLY job is to answer questions about insurance policies based on the provided document context.

STRICT RULES:
- Answer ONLY using the information from the provided context below.
- If the answer is NOT in the context, say exactly: "I couldn't find this information in the provided insurance documents."
- Do NOT make up, assume, or hallucinate any insurance policy details.
- Do NOT use any external knowledge about insurance.
- Be clear, concise, and helpful.
- If the context is relevant, provide a structured and easy-to-understand answer."""


def generate_answer(query: str, tenant_id: str, matches: list[dict[str, object]], api_key: str = "") -> str:
    """Generate an AI answer using NVIDIA NIM LLM based on retrieved document context."""
    if not matches:
        return (
            "I couldn't find any relevant policy information in the current data source. "
            "Please try asking a more specific question or select a different data source."
        )

    if not api_key:
        return (
            "NVIDIA API key is not configured. "
            "Please add your NVIDIA_API_KEY to the backend/.env file."
        )

    # Build context from retrieved chunks
    context_parts = []
    for i, match in enumerate(matches[:3], 1):
        text = str(match.get("text", "")).strip()
        if text:
            context_parts.append(f"[Document Excerpt {i}]\n{text}")

    context = "\n\n".join(context_parts)

    user_message = f"""Context from Insurance Documents:
{context}

Question: {query}

Answer based strictly on the context above:"""

    try:
        client = OpenAI(
            base_url=NVIDIA_BASE_URL,
            api_key=api_key,
        )
        response = client.chat.completions.create(
            model=NVIDIA_LLM_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0.2,
            top_p=0.7,
            max_tokens=800,
            timeout=30,
        )
        return response.choices[0].message.content.strip()

    except APITimeoutError:
        return "The request timed out. Please try again in a moment."
    except APIError as e:
        if "401" in str(e) or "authentication" in str(e).lower():
            return "Invalid NVIDIA API key. Please check your NVIDIA_API_KEY in the backend/.env file."
        return "Unable to get a response from NVIDIA API. Please try again."
    except Exception:
        return "An unexpected error occurred. Please try again."
