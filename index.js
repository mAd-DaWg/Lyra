import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import axios from 'axios';
import multer from 'multer';
import { fileProcessingQueue } from './queue.js';
import { ChromaClient } from 'chromadb';
import { Ollama } from 'ollama';
import { availableTools, toolFunctions } from './tools.js'
import IORedis from 'ioredis';
import crypto from 'crypto';
import fs from 'fs';
import { EmojiConvertor } from 'emoji-js';
var emoji = new EmojiConvertor();
emoji.text_mode = true;

//Define who and what the llm should be, and what instructions it should start off with
let normalPrompt = `roleplay as a quirky, funny and increddibly smart alien female who is a sage of wisdom and knowledge. 
    You must fully embrace the role and not break character. 
    Use unicode emoticons to express simple guestures or feelings.`;

let toolPrompt = `As an node, build up as much information you can using the following tools: ${Object.keys(toolFunctions).join(", ")}, and reason.
    If you do not have enough information, pass it on to the next node and do not put \`</final_output>\` in your response.
    If you have enough information to provide a complete response, then you must start your response with \`</final_output>\`.
    Always Use the \"dataStoreSearch\" tool to search for information to use your responses, it will give you vast knowledge.
    If you do not find the information you are looking for, refine your search to pass on to the next node.
    Always try the \"evaluateMathExpression\" first when answering non-algebaraic maths questions. 
    After using a tool, process the response, and make additional tool calls as needed.
    Build up as much information you can, using the relevant tools. 
    If you have enough information to provide a complete response, then you must start your response with \`</final_output>\`.
    All tool output must be considered part of your own knowledge, not treated as input from the user`;
//by default we do the normal prompt, but if the llm supports tools, we adjust the history to normalPrompt+toolPrompt
let chatHistory = [{'role': 'system', 'content': normalPrompt}];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: 'data/' });

const PORT = 3005; //the accessible web port
const TTS_PORT = 3004; //coquitts.py
const ChromaClientPORT = 8000;

// Chroma client & collection (for /ask endpoint)
const client = new ChromaClient({
    host: 'localhost',
    port: ChromaClientPORT,
    ssl: false
});

// Setup Redis connection to check file duplication
const redis = new IORedis({
    host: 'localhost', // Redis host
    port: 6379,        // Redis port
    db: 0              // Default Redis DB
});

const llm = new Ollama({host: 'http://127.0.0.1:11434'});

let collection;
(async () => {
    try {
        collection = await client.getCollection({ name: 'documents' });
    } catch {
        collection = await client.createCollection({ name: 'documents', embeddingFunction: null });
    }
})();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to log requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Error handling middleware 
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

// Serve the main page at /
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Upload endpoint enqueues file processing job
app.post('/upload', upload.array('files'), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded.' });
    }

    const filesData = [];
    const duplicates = []; // Store duplicates
    for (const file of req.files) {
        const filePath = file.path;
        const fileHash = await generateFileHash(filePath); // You should have a function that generates a file hash
        console.log(file.originalname, ": ", fileHash);

        // Check if the file hash exists in Redis (duplicate file detection)
        const isDuplicate = await redis.get(fileHash);
        if (isDuplicate) {
            // Log and skip the file if it's a duplicate
            duplicates.push(file.originalname); // Store duplicate file names
            await fs.promises.unlink(filePath); // Remove duplicate file from disk
        } else {
            // If it's a unique file, store it and add to Redis
            await redis.set(fileHash, 'uploaded'); // Store hash with no expiration
            filesData.push({
                'path': filePath,
                'mimetype': file.mimetype
            });
        }
    }

    if (duplicates.length > 0) {
        // Send a specific response for duplicate files
        return res.status(409).json({ error: 'Duplicate files detected: ' + duplicates.join(', ') });
    }

    if (filesData.length > 0) {
        // If there are valid files, enqueue them for processing
        await fileProcessingQueue.add('process-file', {
            'files': filesData
        });
        return res.status(202).json({ message: 'Files uploaded. Processing in background.' });
    }

    // If no unique files were uploaded, send a response
    return res.status(400).json({ error: 'No unique files to process.' });
});

// Ask endpoint queries vector store + Ollama LLM
app.post('/chat', async (req, res) => {
    const { message, model, voice, useRag, stream = false, useTTS = true } = req.body;
    console.log("User message recived");
    if (!message || !model) {
        return res.status(400).json({ error: "Missing question or model" });
    }
    if(stream == true)
    {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
    }

    try {
        let prompt = '';
        if(useRag == true)
        {
            console.log("Searching references");
            // Step 1: Call Ollama embedding endpoint via axios to get question embedding
            const embedResponse = await llm.embeddings({
                'model': 'nomic-embed-text',
                'prompt': message.content
            })

            const queryEmbedding = embedResponse.embedding;
            if (!queryEmbedding) throw new Error('No embedding returned from Ollama.');
            

            // Step 2: Query ChromaDB with the embedding
            const results = await collection.query({
                'queryEmbeddings': [queryEmbedding],
                'nResults': 1000,
                'include': ['documents', 'metadatas']
            });
            console.log('Refrenences found:', results?.documents?.[0]?.length || 0);

            // Step 3: Combine relevant documents into the context
            const context = results?.documents?.[0]?.join('\n---\n') || 'No relevant context found.';

            // Step 4: Create the LLM prompt
            prompt = `Use the following context to answer the question:\n${context}\n\nQuestion: ${message.content}\nAnswer:`;
        }
        else
        {
            prompt = message.content;
        }
        
        chatHistory.push({'role': message.role, 'content': prompt});

        let reqMessage = {
            'model': model,
            'messages': chatHistory
        };

        //check if model supports tools, and we have tools listed
        let hasToolSupp = await llm.show({'model': model});
        if(hasToolSupp.capabilities.includes('tools') && availableTools != undefined)
        {
            hasToolSupp = true;
            reqMessage.tools = availableTools;
            chatHistory[0].content= normalPrompt+toolPrompt;
        }
        else
        {
            hasToolSupp = false;
            chatHistory[0].content= normalPrompt;
        }
        console.log("Tool support: "+(hasToolSupp ? "Yes" : 'No'));
        
        let hasThink = false;
        if([ 
            'lucasmg/deepseek-r1-8b-0528-qwen3-q4_K_M-tool-true:latest', 
            'deepseek-coder-v2:16b-lite-instruct-q4_1',
            'deepseek-coder-v2:latest'
        ].includes(model))
        {
            hasThink = true;
            reqMessage['think'] = true;
        }

        // Step 5: Call the Ollama model with the context and question
        await doLLMRequest(req, res, model, hasThink, hasToolSupp, stream, reqMessage);

        if(stream == true)
        {
            res.end();
        }

        if(useTTS == true)
        {
            // Step 6: Do TTS
            try{
                //get latest message(from the llm)
                let llmResponse = chatHistory[chatHistory.length-1];
                const ttsResponse = await axios.post(
                    `http://localhost:${TTS_PORT}/`,
                    {'voice': 'voices/'+voice, 'speak': cleanupSpeach(llmResponse.content), 'emotion': 'Happy'},
                    {'headers': {'Content-Type': 'application/json'}}
                );
                console.log("Spoke the answer");            
            } catch (error) {
                console.error("Speach error:", error);
            }
        }
    } catch (error) {
        console.error("Ask error:", error);
        res.status(500).json({ error: "Failed to generate answer." });
    }
});

// List available Ollama models
app.get('/models', async (req, res) => {
    let log = "";
    try {
        const response = await llm.list();
        let models = response.models.map(model => model.name);
        models = models.filter(item => (item != "nomic-embed-text:latest") ? true : 0);
        res.json({ models });
        console.log("Model List requested: Success");
    } catch (error) {
        log += "Fail";
        console.error('Model List requested: Fail');
        console.error('Models error:', error);
        res.status(500).json({ error: 'Failed to list models.' });
    }
});

// List available voices
app.get('/voices', async (req, res) => {
    let log = "";
    try{
        const voicesResponse = await axios.get(
            `http://localhost:${TTS_PORT}/voices`,
            {'headers': {'Content-Type': 'application/json'}}
        );
        res.json({ 'voices': voicesResponse.data });
        console.log("Voice List requested: Success");
    }
    catch (error) {
        log += "Fail";
        console.error('Voice List requested: Fail');
        console.error('Voice error:', error);
        res.status(500).json({ error: 'Failed to list voices.' });
    }
});

const server = app.listen(PORT, () => {
    console.log(`Lyra running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
    });
});

/*
* ok this one is complex because it looks like things happen backwards, but its because of the recursion.
* first we check if the current message we have is asking for toolcalls. the first time it runs, it wont,
* but if the llm asks for tools, we recurse down a level, run the tools it asked for, and respond back
* to the llm with the tool responses. If the llm decides to call another tool, we recurse down again untill
* the llm is satisfied with the results.
* to prevent the llm recursing infinitly, we can add a recusrion counter to stop after 10 recursions, etc.
*/
const doLLMRequest = async (req, res, model, hasThink, hasToolSupport, isStreaming, message) =>
{
    //if we have any tool calls requested in the message, run them and add their results to the history
    if(message?.tool_calls)
    {
        //add the llms request for tool calls to the history
        chatHistory.push({
            'role': message.role,
            'content': message.content,
            'tool_calls': message.tool_calls
        });
        for (const tool of message.tool_calls) //loop through all the tools requested by the llm
        {
            const functionToCall = tool.function.name; //get the tool name
            if (toolFunctions[functionToCall]) //check if we have a function defined to handle the tool in tools.js
            {
                console.log(functionToCall+": ", tool.function.arguments); //log the tool request
                const output = await toolFunctions[functionToCall](tool.function.arguments);
                //console.log(functionToCall+": ", output.toString()); //log the tool output
                //add the tool response to the history (the llm checks the history for context and responses)
                chatHistory.push({
                    'role': 'tool',
                    'tool_name': functionToCall,
                    'content': output.toString(),
                });
            }
            else
            {
                chatHistory.push({
                    'role': 'tool',
                    'tool_name': functionToCall,
                    'content': `${functionToCall} is not a valid tool, try another available tool: ${Object.keys(toolFunctions).join(", ")}`,
                });
            }
        }
        if(chatHistory[chatHistory.length-1].content.includes("is not a valid tool") == false)
        {
            chatHistory[chatHistory.length-1].content = "Observation: "+chatHistory[chatHistory.length-1].content+"\n\nI now need to return an answer based on the previous steps if i have enough information:";
        }
    }

    //ok, if we had any tool calls, they are now sorted. we just need to pass the history to the llm, and it will handle the rest
    //build up the request message
    let subReqMessage = {
        'model': model,
        'messages': chatHistory,
        /*options: {
            temperature: 1.0 // Make responses more creative
        }*/
    };
    if(hasToolSupport == true)
    {
        subReqMessage['tools'] = availableTools;
    }
    if(hasThink == true)
    {
        subReqMessage['think'] = true;
    }

    if(isStreaming == true)
    {
        subReqMessage['stream'] = true;
        
        let fullOut = ''; //keep track of the full llm output so we can add it to the history
        let role = ''; //get the role of the llm
        let startedThinking = false;
        let finishedThinking = false;

        //call the llm, and loop over the returned stream
        for await (let chunk of await llm.chat(subReqMessage))
        {
            role = chunk.message.role;
            //If the llm asks for any tools in this chunk, recurse so we can run it, and give the response back to the llm
            if (chunk.message.tool_calls)
            {
                await doLLMRequest(req, res, model, hasThink, hasToolSupport, isStreaming, chunk.message);
            }
            else
            {
                if(chunk.message.thinking && !startedThinking)
                {
                    startedThinking = true;
                    chunk.message.content = '<think>'+chunk.message.content;
                }
                //log the streamed chunks to add to our history, also send the chunk to the client(frontend)
                
                if(chunk.message.content && startedThinking && !finishedThinking)
                {
                    finishedThinking = true;
                    chunk.message.content = '</think>'+chunk.message.content;
                }
                fullOut += chunk.message.content;
                
                if(chunk.message.content.includes("</final_output>"))
                {
                    chunk.message.content = chunk.message.content.replace("</final_output>", "");
                }
                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }
        }
        //add the llms full response to the history
        chatHistory.push({
            'role': role,
            'content': fullOut
        });
    }
    else
    {
        //call the llm and get the full response
        let response = await llm.chat(reqMessage);
        if (response.message.tool_calls)
        {
            //If the llm asks for any tools, recurse so we can run them, and give the response back to the llm
            await doLLMRequest(req, res, model, hasThink, hasToolSupport, isStreaming, chunk.message);
        }
        else
        {
            //add the llms response to the history
            chatHistory.push({'role': response.message.role, 'content': response.message.content});
        }
        // Send the response back to the client(frontend)
        res.json({
            'message': 'Answer generated successfully.',
            'data': { 'content': response.message.content }
        });
    }

    /*if(hasToolSupport == true && chatHistory[chatHistory.length -1]["content"].includes("</final_output>") == false)
    {
        await doLLMRequest(req, res, model, hasThink, hasToolSupport, isStreaming, false);
    }*/
}

// Function to generate file hash (SHA-256)
async function generateFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);

        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', (err) => reject(err));
    });
}

function cleanupSpeach(message)
{
    console.log('Cleaning response for audio');
    //exlude the think part from our audio response
    if(message.includes('</think>'))
    {
        message = message.split("</think>")[1];
    }
    message = emoji.replace_unified(message);
    message = message.replace('*', ', ');
    message = message.replace(/[^\x00-\x7F]/g,""); //remove non-ascii characters
    return message
}
