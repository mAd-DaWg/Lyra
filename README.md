# 🧠 Local RAG Chat (LangChain + Ollama + ChromaDB)

This project is a simple but powerful **REST API** and **Chat App** for doing **Retrieval-Augmented Generation (RAG)** and **Tool calling** locally. It uses:

- 🔍 **LangChain** for document loading and chunking  
- 🧠 **Ollama** for local LLMs and embeddings  
- 🧱 **ChromaDB** as a vector store
- 📦 **Express.js** for the web server
- 📄 **Multer** for file uploads
- 📄 **Valkey** as the Redis-compatible backend for job queues (instead of Redis itself)

No cloud dependencies. No API keys. 100% local.

---

## ✨ Features

- Upload multiple file types (PDF, DOCX, PPTX, MD) to build a persistent vector store
- Asynchronous background processing of uploads to split, embed, and save vectors
- Fast, responsive /chat endpoint querying the built vector DB
- Configurable chunk sizes and chunk overlaps
- Use of chromaDB vector store and `nomic-embed-text` embeddings via ollama
- Valkey-based job queue for scaling uploads and encoding without blocking API

---

## 🚀 Getting Started

### Dependencies

- Node.js 18+
- ollama
- Valkey installed and running (Arch Linux: \`sudo pacman -S valkey && systemctl enable valkey && systemctl start valkey\`)  
- npm to get project dependencies
- pip to get other dependancies

### 1. Clone the repo

```bash
git clone https://github.com/mAd-DaWg/Lyra.git
cd Lyra
```

### 2. Install dependencies

Simply running the project will install dependancies

### 3. Install Ollama and models

Download and install Ollama:  
👉 <https://ollama.com>

Then pull the model like this:

```bash
ollama run gemma3n:e4b  #can be whatever llm you want. for huggingface use ollama run hf.co/<model name copied on site>
ollama run nomic-embed-text #required
```

> Tip: Use `ollama list` to see installed models.

---

## 🛠️ API Endpoints

### `POST /upload`

Upload a document to be added to the vector DB.

- Accepts file upload (\`file\`) and optional \`model\` param  
- Enqueues background job to process documents and add vectors to DB  
- Responds immediately with job ID

**Body**:

- `file`: any supported file (`pdf`, `docx`, `pptx`, `md`)

**Example (using curl):**

```bash
curl -X POST http://localhost:3005/upload \
  -F "file=@./docs/example.pdf"
```

---

### `POST /chat`

Ask a question.

- Accepts JSON body with \`question\` and optional \`model\`  
- Queries vector store and Ollama model  
- Returns generated answer  

**Body (JSON):**

```json
{
    "question": "What are the benefits of solar panels?",
    "model": "llama3"
}
```

**Response:**

```json
{
    "message": "Answer generated successfully.",
    "data": {
        "content": "Solar panels convert sunlight into electricity..."
    }
}
```

---

### `GET /models`

List available models installed in Ollama.

**Response:**

```json
{
    "models": [
        { "name": "llama3" },
        { "name": "nomic-embed-text" }
    ]
}
```

---

## 🧠 How It Works

1. File is uploaded → split into text chunks  
2. Chunks are embedded using Ollama (`nomic-embed-text`)  
3. Embeddings + content are stored in **ChromaDB**  
4. On query:
    - The question is embedded
    - Closest chunks are retrieved
    - Those are used as context in a prompt
    - A local LLM (like `llama3`) generates the answer

---

## 📁 Project Structure

```
.
├── data/                # Temporary upload storage
├── index.js             # Express app and routes
├── rag.js               # RAG logic (embedding, vector DB, etc.)
├── package.json
└── README.md
```

---

## ✅ Requirements

- Node.js ≥ 18  
- Ollama installed and running  
- Ollama embedding model(required): `nomic-embed-text`  
- Ollama models(any llm you want): `llama3`, `gemma3:latest`, `etc`
- Supported file types: `.pdf`, `.docx`, `.pptx`, `.md`

---

## 🔒 Privacy

All processing is local. No external API calls (except optional Hugging Face, to pull models, or updates you choose to add).

---

## 📌 Notes

- This is a great base for private knowledge assistants.
- Persistent ChromaDB store grows with each upload; no data removal. swap with FAISS/Qdrant if needed.
- Can use any models provided its ollama compatible.
- Uploads are processed asynchronously via job queue to handle large files efficiently  
- Uses Valkey as a drop-in Redis-compatible queue backend

---

## 🧪 Roadmap Ideas

- [ ] Add support for plain `.txt` or `.html`
- [ ] Expose a `/clear` endpoint to reset ChromaDB
- [ ] Add metadata tagging for document source
- [ ] Agentic tool calling
- [x] Streaming LLM responses (done)

---

## 🧑‍💻 License

MIT — free to use and modify.

---

Made with 🧠 + ☕ by mAd-DaWg
