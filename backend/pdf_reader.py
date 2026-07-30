import PyPDF2

def extract_text_from_pdf(file_path: str) -> str:
    """
    Reads a PDF file and extracts all text.
    """
    try:
        text_content = []
        with open(file_path, "rb") as file:
            reader = PyPDF2.PdfReader(file)
            for page in reader.pages:
                text = page.extract_text()
                if text:
                    text_content.append(text)
        return "\n".join(text_content)
    except Exception as e:
        raise ValueError(f"Failed to read PDF: {str(e)}")
