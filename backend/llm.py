from __future__ import annotations


def generate_answer(query: str, tenant_id: str, matches: list[dict[str, object]]) -> str:
    if not matches:
        return (
            "I couldn't find any relevant policy information in the current data source. "
            "Please try asking a more specific question or select a different data source."
        )

    # Convert tenant ID to a readable format (e.g. 'tenant-life' -> 'Life')
    readable_topic = tenant_id.replace("tenant-", "").title()
    
    # Extract and format text with artificial paragraphs for better readability
    formatted_chunks = []
    for match in matches[:2]:
        raw_text = str(match.get("text", ""))
        # Add newlines after periods to break up the wall of text
        formatted_text = raw_text.replace(". ", ".\n\n")
        formatted_chunks.append(formatted_text)

    context = "\n\n".join(formatted_chunks)
    
    return (
        f"Based on the {readable_topic} guidelines, here is the information you requested:\n\n"
        f"{context}\n\n"
        "Let me know if you need any more specific details!"
    )
