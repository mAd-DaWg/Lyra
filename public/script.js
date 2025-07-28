const modelSelector = document.getElementById('modelSelector');
const voiceSelector = document.getElementById('voiceSelector');
var chatMessages = document.getElementById('chatMessages');
var userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const useRagCheck = document.getElementById('useRag');
const useTTSCheck = document.getElementById('useTTS');

var currentMessageElement = null;
var selectedModel = '';
var selectedVoice = '';
var useRag = false;
var useTTS = true;
async function fetchModels() {
   try {
       const response = await fetch('/models');
       if (!response.ok) {
           throw new Error('Network response was not ok');
       }
       const json = await response.json();

       if (!json.models || !Array.isArray(json.models)) {
           console.error('No models found in response:', json);
           return;
       }

       const select = document.getElementById('modelSelector');
       // Clear current options
       select.innerHTML = '';
       for(let i = 0; i < json.models.length; i++) {
           let modelName = json.models[i];
           const option = document.createElement('option');
           option.value = modelName;
           option.textContent = modelName;
           select.appendChild(option);
       };
       selectedModel = json.models[0];
   } catch (error) {
       console.error('Failed to load models:', error);
       const select = document.getElementById('modelSelector');
       select.innerHTML = '<option value="">Failed to load models</option>';
   }
}

async function fetchVoices() {
   try {
       const response = await fetch('/voices');
       if (!response.ok) {
           throw new Error('Network response was not ok');
       }
       const json = await response.json();

       if (!json.voices || !Array.isArray(json.voices)) {
           console.error('No voices found in response:', json);
           return;
       }

       const select = document.getElementById('voiceSelector');
       // Clear current options
       select.innerHTML = '';
       for(let i = 0; i < json.voices.length; i++) {
           let voiceName = json.voices[i];
           const option = document.createElement('option');
           option.value = voiceName;
           option.textContent = voiceName;
           select.appendChild(option);
       };
       selectedVoice = json.voices[0];
   } catch (error) {
       console.error('Failed to load voices:', error);
       const select = document.getElementById('voiceSelector');
       select.innerHTML = '<option value="">Failed to load voices</option>';
   }
}

function createMessageElement(role) {
   const messageElement = document.createElement('div');
   messageElement.classList.add('message', `${role}-message`);
   return messageElement;
}

function scrollToBottom() {
   chatMessages.scrollIntoView(false);
}

function updateMessageContent(messageElement, content, format = true) {
   if (format) {
       const formattedContent = formatMessage(content);
       
       messageElement.innerHTML = formattedContent;
   } else {
       messageElement.textContent = DOMPurify.sanitize(content);
   }

   scrollToBottom();
}

function formatMessage(content) {
   const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
   let formattedContent = content.replace(codeBlockRegex, (match, language, code) => {
       language = language || 'plaintext';
       const highlightedCode = hljs.highlight(code.trim(), { language: language }).value;
       const escapedCode = DOMPurify.sanitize(highlightedCode);
       return `<pre><div class="code-header"><span class="code-language">${language}</span><button class="copy-button">Copy</button></div><code class="hljs ${language}">${escapedCode}</code></pre>`;
   });

   // Format inline code
   formattedContent = formattedContent.replace(/`([^`\n]+)`/g, '<code>$1</code>');

   // Remove thinking block from output
   const start = content.indexOf('<think>');
   const end = content.indexOf('</think>');
   if (start !== -1 && end !== -1) {
       formattedContent = DOMPurify.sanitize(marked.parse(content.substring(0, start))) + 
                         `<details class="thinking-detail"><summary>Thinking</summary>` +
                         DOMPurify.sanitize(marked.parse(content.substring(start + 7, end))) +
                         `</details>` +
                         DOMPurify.sanitize(marked.parse(content.substring(end + 8)));
   } else {
       formattedContent = DOMPurify.sanitize(marked.parse(formattedContent));
   }

   return formattedContent;
}

function addMessageToChat(role, content, format = true) {
   const messageElement = createMessageElement(role);
   updateMessageContent(messageElement, content, format);
   chatMessages.appendChild(messageElement);
   scrollToBottom();
}

// Add event delegation for copy buttons
chatMessages.addEventListener('click', (e) => {
   if (e.target.classList.contains('copy-button')) {
       const codeElement = e.target.closest('pre').querySelector('code');
       const codeText = codeElement.textContent;

       navigator.clipboard.writeText(codeText)
           .then(() => {
               e.target.textContent = 'Copied!';
               setTimeout(() => {
                   e.target.textContent = 'Copy';
               }, 1500);
           })
           .catch(err => {
               console.error('Failed to copy code: ', err);
           });
   }
});

document.getElementById('uploadForm').onsubmit = async (e) => {
   e.preventDefault();
   const status = document.getElementById('uploadStatus');
   status.textContent = 'Uploading...';

   const fileInput = document.getElementById('fileInput');
   if (fileInput.files.length === 0) {
       status.textContent = 'Please select a file.';
       return;
   }

   const formData = new FormData();
   for (const file of fileInput.files) {
       formData.append('files', file);
   }

   try {
       const res = await fetch('/upload', {
           method: 'POST',
           body: formData,
       });
       const json = await res.json();

       if (res.ok) {
           status.textContent = json.message || 'Upload successful!';
       } else if (res.status === 409) {
           // Handle duplicates specifically
           status.textContent = 'Duplicate file(s) detected: ' + json.error;
       } else {
           status.textContent = 'Upload failed: ' + (json.error || 'Unknown error');
       }
   } catch (err) {
       status.textContent = 'Upload error: ' + err.message;
   }
};

document.addEventListener('DOMContentLoaded', () => {
   fetchModels();
   fetchVoices();

   modelSelector.addEventListener('change', (e) => {
       selectedModel = e.target.value;
   });
   voiceSelector.addEventListener('change', (e) => {
       selectedVoice = e.target.value;
   });
   useRagCheck.addEventListener('change', (e) => {
       useRag = e.target.checked;
   });
   useTTSCheck.addEventListener('change', (e) => {
       useTTS = e.target.checked;
   });
   
   sendButton.addEventListener('click', sendMessage);
   userInput.addEventListener('keypress', (e) => {
       if (e.key === 'Enter' && !e.shiftKey) {
           e.preventDefault();
           sendMessage();
       }
   });
});

function sendMessage() {
   const message = userInput.value.trim();
   if (message) {
       addMessageToChat('user', message, true);
       userInput.value = '';

       // Create a new Lyra message element for this response
       currentMessageElement = createMessageElement('lyra');
       chatMessages.appendChild(currentMessageElement);
       
       fetch('/chat', {
           method: 'POST',
           headers: {
               'Content-Type': 'application/json',
           },
           body: JSON.stringify({
               model: selectedModel,
               voice: selectedVoice,
               useRag: useRag,
               useTTS: useTTS,
               message: {role: 'user', content: message},
               stream: true,
           }),
       })
       .then(response => {
           if (!response.ok) {
               throw new Error(`HTTP error! status: ${response.status}`);
           }
           if (response.headers.get('content-type')?.includes('text/event-stream')) {
               return handleStreamingResponse(response);
           } else {
               return response.json();
           }
       })
       .then(data => {
           if (data.error) {
               throw new Error(data.error);
           }
           // For non-streaming responses
           if (data.response) {
               updateMessageContent(currentMessageElement, data.response, true);
           }
       })
       .catch(error => {
           console.error('Error:', error);
           updateMessageContent(currentMessageElement, `Sorry, there was an error: ${error.message}`, false);
       });
   }
}

function handleStreamingResponse(response) {
   return new Promise((resolve, reject) => {
       const reader = response.body.getReader();
       let accumulatedContent = '';

       function read() {
           reader.read().then(({ done, value }) => {
               if (done) {
                   resolve({ response: accumulatedContent });
                   return;
               }

               const chunk = new TextDecoder("utf-8").decode(value);
               const lines = chunk.split('\n');
               
               lines.forEach(line => {
                   if (line.startsWith('data: ')) {
                       try {
                           const data = JSON.parse(line.substring(6));
                           if (data.message && data.message.content) {
                               accumulatedContent += data.message.content;
                               updateMessageContent(currentMessageElement, accumulatedContent, true);
                           }
                       } catch (error) {
                           console.error("Error parsing stream data:", error, line);
                       }
                   }
               });
               read();
           }).catch(reject);
       }
       read();
   });
}