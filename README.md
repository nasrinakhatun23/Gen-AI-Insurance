# RAG Chatbot

This project implements a Retrieval-Augmented Generation (RAG) chatbot using FastAPI and React.

## Features

- Document ingestion and preprocessing (PDF)
- Text chunking and metadata association
- Embedding generation using NVIDIA NIM embeddings
- Vector storage with FAISS and SQLite
- Retrieval and similarity search
- Answer generation using NVIDIA LLM
- React UI for easy interaction with the chatbot

## Data

- The application supports uploading PDF policy documents directly through the web interface.
- Uploaded documents are automatically parsed, chunked, and indexed into the vector database.

## Installation

1. Clone the repository:

```bash
git clone <repo-url>
cd insurance-chatbot
```

2. Create a virtual environment:

```bash
python -m venv venv
```

3. Activate the virtual environment:

- **Windows (PowerShell)**: `.\venv\Scripts\Activate.ps1`
- **macOS/Linux**: `source venv/bin/activate`

4. Install dependencies:

```bash
pip install -r backend/requirements.txt
npm install
```

5. Set up NVIDIA API key:

Add your API key to `backend/.env`:
```env
NVIDIA_API_KEY=your_nvidia_api_key_here
```

## NVIDIA NIM

The project uses the `openai` Python SDK with NVIDIA NIM API to generate embeddings and synthesize answers from retrieved context. You must provide a valid NVIDIA API key for generation and final answer synthesis.

## Usage

Start the backend and frontend servers:

1. Run the backend server:
```bash
python -m uvicorn backend.app:app --reload
```

2. Run the frontend application:
```bash
npm run dev
```

Open `http://localhost:5173` in your browser to interact with the chatbot.

## Requirements

- Python 3.10+
- Node.js 18+
- NVIDIA API key
