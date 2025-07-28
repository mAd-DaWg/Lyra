import path from 'path';
import fs from 'fs/promises';
import mime from 'mime-types';

import { ChromaClient } from 'chromadb';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import { PPTXLoader } from '@langchain/community/document_loaders/fs/pptx';
import { NotionLoader } from '@langchain/community/document_loaders/fs/notion';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import { JSONLoader } from 'langchain/document_loaders/fs/json';
import { EPubLoader } from '@langchain/community/document_loaders/fs/epub';
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';

import { OllamaEmbeddings } from '@langchain/ollama';

const ChromaClientPORT = 8000;
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const BATCH_SIZE = 5000;

const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
});

const embeddings = new OllamaEmbeddings({
    model: 'nomic-embed-text',
});

const client = new ChromaClient({
    host: 'localhost',
    port: ChromaClientPORT,
    ssl: false,
});

function batchchunk(arr, chunkSize) {
    if (chunkSize <= 0) throw "Invalid chunk size";
    var R = [];
    for (var i=0,len=arr.length; i<len; i+=chunkSize)
        R.push(arr.slice(i,i+chunkSize));
    return R;
}

// Loader mapper by MIME type (or fallback by file extension)
function getLoader(filePath, mimetype) {
    const ext = path.extname(filePath).toLowerCase();
    const type = mimetype || mime.lookup(filePath) || '';

    if (type.includes('pdf')) return new PDFLoader(filePath);
    if (type.includes('word') || ext === '.docx') return new DocxLoader(filePath);
    if (type.includes('presentation') || ext === '.pptx') return new PPTXLoader(filePath);
    if (type.includes('markdown') || ext === '.md') return new NotionLoader(filePath);
    if (type.includes('text') || ext === '.txt') return new TextLoader(filePath);
    if (type.includes('html') || ext === '.html') return new CheerioWebBaseLoader(`file://${path.resolve(filePath)}`);
    if (type.includes('json') || ext === '.json') return new JSONLoader(filePath);
    if (type.includes('csv') || ext === '.csv') return new CSVLoader(filePath);
    if (ext === '.epub') return new EPubLoader(filePath);

    throw new Error(`Unsupported file type: ${type} (${ext})`);
}

function sanitizeMetadata(metadata) {
    const sanitized = {};
    for (const [key, value] of Object.entries(metadata)) {
        if (
            value === null ||
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
        ) {
            sanitized[key] = value;
        } else {
            try {
                sanitized[key] = JSON.stringify(value);
            } catch {
                sanitized[key] = String(value);
            }
        }
    }
    return sanitized;
}

export async function processFilesForRAG(fileList) {
    console.log(`⏳ Processing ${fileList.length} file(s)...`);

    let allChunks = [];

    for (const file of fileList) {
        const { path: filePath, mimetype } = file;

        try {
            const loader = getLoader(filePath, mimetype);
            console.log(`📄 Loading ${filePath}...`);
            const docs = await loader.load();

            console.log(`✂️ Splitting ${docs.length} docs...`);
            const chunks = await textSplitter.splitDocuments(docs);

            chunks.forEach((chunk, i) => {
                chunk.metadata = {
                    ...chunk.metadata,
                    source: path.basename(filePath),
                    chunk_id: `${path.basename(filePath)}-${i}`,
                };
            });

            allChunks.push(...chunks);

            fs.promises.unlink(filePath).catch((err) => {
                console.warn(`⚠️ Could not delete ${filePath}:`, err.message);
            });
        } catch (err) {
            console.error(`❌ Error processing ${filePath}:`, err.message);
        }
    }

    if (allChunks.length === 0) {
        console.log(`🚫 No valid chunks extracted.`);
        return;
    }

    console.log(`🔗 Connecting to vector store...`);
    let collection;
    try {
        collection = await client.getCollection({ name: 'documents' });
    } catch {
        collection = await client.createCollection({
            name: 'documents',
            embeddingFunction: embeddings.embedQuery.bind(embeddings),
        });
    }

    console.log(`🧠 Generating embeddings for ${allChunks.length} chunks...`);
    const documents = await Promise.all(
        allChunks.map(async (chunk) => ({
            id: chunk.metadata.chunk_id,
            metadata: sanitizeMetadata(chunk.metadata),
            document: chunk.pageContent,
            embedding: await embeddings.embedQuery(chunk.pageContent),
        }))
    );
    
    let batchChunks = batchchunk(documents, BATCH_SIZE);

    console.log(`📥 Adding chunks to ChromaDB...`);
    for(let i=0; i< batchChunks.length; i++)
    {
        let current_chunk = batchChunks[i];
        await collection.add({
            ids: current_chunk.map(d => d.id),
            metadatas: current_chunk.map(d => d.metadata),
            documents: current_chunk.map(d => d.document),
            embeddings: current_chunk.map(d => d.embedding),
        });
    }

    console.log(`✅ All files processed successfully.`);
}
