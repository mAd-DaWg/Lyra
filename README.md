# 🧠 Local RAG Chat (LangChain + Ollama + ChromaDB)

This project is a simple but powerful **REST API** and **Chat App** for doing **Retrieval-Augmented Generation (RAG)** and **Tool calling** locally. It uses:

- 🔍 **LangChain** for document loading and chunking  
- 🧠 **Ollama** for local LLMs and embeddings  
- 🧱 **ChromaDB** as a vector store
- 📦 **Express.js** and **Flutter** for the web servers
- 📄 **Multer** for file uploads
- 📄 **Valkey** as the Redis-compatible backend for job queues (instead of Redis itself)
- 🗣️ **Coqui TTS** for text to speech using the `AstraMindAI/xtts2-gpt` model for voice cloning

No cloud dependencies. No API keys. 100% local.

---

## ✨ Features

- Upload multiple file types (PDF, EPUB, DOCX, PPTX, MD, TXT, HTML, JSON, CSV) to build a persistent vector store
- Asynchronous background processing of uploads to split, embed, and save vectors
- Fast, responsive /chat endpoint querying the built vector DB
- Configurable chunk sizes and chunk overlaps
- Use of chromaDB vector store and `nomic-embed-text` embeddings via ollama
- Valkey-based job queue for scaling uploads and encoding without blocking API
- Voice cloning. Simply add a voice sample `<voice_name>.wav` file in the voices directory. (The tts will not work without a voice sample)

---

## 🚀 Getting Started

### Dependencies

- Node.js 18+
- Python 3.11 (yay -S python311) [Installs alongside existing python]
- ollama
- Valkey installed and running (Arch Linux: \`sudo pacman -S valkey && sudo systemctl enable valkey && sudo systemctl start valkey\`)  
- npm to get project dependencies
- pip to get other dependancies

### 1. Clone the repo

```bash
git clone https://github.com/mAd-DaWg/Lyra.git
cd Lyra
```

### 2. Install Ollama and models

Download and install Ollama:  
👉 <https://ollama.com>

Then pull the model like this:

```bash
ollama run nomic-embed-text    # required for RAG embeddings
ollama run gemma3n:e4b         # can be whatever llm you want
ollama run hf.co/Qwen/Qwen3-8B # to use models found on https://huggingface.co
```

> Tip: Use `ollama list` to see installed models.

---

### 3. Install dependencies

Simply running the project will install the remaining dependancies not mentioned above. The LLM models will need to be downloaded using above. The first launch will have some issues due to the runBG.sh script taking time to install all the dependancies, and encountering an issue you need to manually patch. simply ctrl+c once both terminals fail with an error.

Start Lyra:

```bash
./start.sh
```

Encounter errors in both terminals, then ctrl+c.

Apply the fix:

- change `/Lyra/.venv/lib/python3.11/site-packages/TTS/tts/models/xtts.py`, line 714
  - `checkpoint = load_fsspec(model_path, map_location=torch.device("cpu"))["model"]`
- to
  - `checkpoint = load_fsspec(model_path, map_location=torch.device("cpu"), weights_only=False)["model"]`

```bash
./start.sh
```

## Run Lyra

Simply issue the following command to launch:

```bash
./start.sh
```

## 🛠️ API Endpoints

### `GET /`

Presents a user interface to interact with Lyra

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

- Queries vector store and Ollama model  
- Returns generated answer  

**Body (JSON):**

```json
{
    "model":"gemma3:latest",  //LLM to query
    "voice":"alien.wav",      //TTS voice to use
    "useRag":false,           //Use non-tool based RAG
    "useTTS":true,            //Do tts or not
    "message":{"role":"user","content":"yep"}, //The message you want to send to the LLM
    "stream":true             //Stream the response or not
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

### `GET /voices`

List available voices in the voices folder.

**Response:**

```json
{
    "voices":[
        "alien.wav",
        "david-attenborough_original.wav",
        "..."
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
├── chroma               # The RAG datastore
├── data/                # Temporary upload storage
├── index.js             # Entry point for Lyra nodejs server
├── rag.js               # RAG logic (embedding, vector DB, etc.)
├── tools.js             # Tools for the LLM to use (if the LLM supports toolcalls)
├── coquitts.py          # Python TTS server using Coqui TTS
├── runBG.sh             # Starts chromaDB and coquitts.py server
├── runLyra.sh           # Starts the Lyra nodejs server
├── start.sh             # Starts runBG.sh and runLyra.sh in a co-ordinated manner
├── package.json
└── README.md            # You current have this open
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

- [x] Add support for plain `.txt` or `.html`
- [x] Streaming LLM responses (done)
- [ ] Add multimodal support for images and etc
- [ ] Add voice input functionality
- [ ] Expose a `/clear` endpoint to reset ChromaDB
- [ ] Add metadata tagging for document source
- [ ] Agentic tool calling

---

## 🧑‍💻 License

MIT — free to use and modify.

---

Made with 🧠 + ☕ by mAd-DaWg
