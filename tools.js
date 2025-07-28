import { ChromaClient } from 'chromadb';
import { Ollama } from 'ollama';
import { evaluate } from 'mathjs';
import * as Nerdamer from 'nerdamer';

const llm = new Ollama({host: 'http://127.0.0.1:11434'});
const availableTools = [];
const toolFunctions = {};
//RAG vector store search
availableTools.push({
    'type': 'function',
    'function': {
        'name': 'dataStoreSearch',
        'description': 'Search for information.',
        'parameters': {
            'type': 'object',
            'required': ['query'],
            'properties': {
                'query': {
                    'type': 'string',
                    'description': 'The information to search for.'
                }
            }
        }
    }
});

// Implement the tool function
toolFunctions['dataStoreSearch'] = async (args) => {
    try {
        const client = new ChromaClient({
            host: 'localhost',
            port: 8000,
            ssl: false
        });

        // Get the collection
        let collection;
        try {
            collection = await client.getCollection({ name: 'documents' });
        } catch {
            collection = await client.createCollection({ name: 'documents', embeddingFunction: null });
        }

        const embedResponse = await llm.embeddings({
            'model': 'nomic-embed-text',
            'prompt': args.query
        })
        const queryEmbedding = embedResponse.embedding;
        if (!queryEmbedding) throw new Error('No embedding returned from Ollama.');

        // Perform a search using the nomic-embed-text model
        const results = await collection.query({
            'queryEmbeddings': [queryEmbedding],
            'nResults': 1000,
            'include': ['documents', 'metadatas']
        });

        // Format and return the search results
        let context = '';
        if (results && results.documents && results.documents[0].length > 0) {
            context = results.documents[0].join('\n---\n');
        } else {
            context = 'No relevant documents found.';
        }

        return `The following information is from your dataStoreSearch search:\n\`${context}\`\n\n The dataStoreSearch search query you used: \`${args.query}\`\n`;
    }
    catch (error) {
        return `Error during vector store search: ${error.message}`;
    }
};

// Math expression evaluator tool
availableTools.push({
    'type': 'function',
    'function': {
        'name': 'evaluateMathExpression',
        'description': 'Solve any math problem thats not algebraic',
        'parameters': {
            'type': 'object',
            'required': ['expression'],
            'properties': {
                'expression': {
                    'type': 'string',
                    'description': 'Math expression to evaluate (e.g. "2 + 3 * (4 - 5)").'
                }
            }
        }
    }
});

// Function implementation
toolFunctions['evaluateMathExpression'] = async (args) => {
    try {
        let param = args.expression.replace('=', '==');
        return evaluate(param);
    } catch (error) {
        return `Math evaluation error: ${error.message}`;
    }
};

// Add a tool for solving equations
availableTools.push({
   'type': 'function',
   'function': {
       'name': 'solveEquation',
       'description': 'Solve algebraic equations (e.g., "x^2 + 3x - 4 = 0").',
       'parameters': {
           'type': 'object',
           'required': ['equation', 'solveFor'],
           'properties': {
               'equation': {
                   'type': 'string',
                   'description': 'Algebraic equation to solve (e.g., "x^2 + 3x - 4 = 0").'
               },
               'solveFor': {
                   'type': 'string',
                   'description': 'The variable in the equation to solve for, for example `x`'
               }
           }
       }
   }
});

// Function implementation for solving equations using mathjs solve function
toolFunctions['solveEquation'] = async (args) => {
  try {
    // Use Nerdamer to parse and solve the equation
    const parsedEq = Nerdamer.parse(args.equation);
    
    // Check if it's a polynomial equation (e.g., x^2 + 3x - 4 = 0)
    if (parsedEq.lhs instanceof Nerdamer.Polynomial) {
      // Use Nerdamer to find the roots of the polynomial
      const solution = parsedEq.solveFor(args.solveFor);
      return JSON.stringify(solution);
    } else {
      // If it's not a polynomial equation, use Nerdamer's solve method
      const solution = parsedEq.solve();
      return JSON.stringify(solution);
    }
  } catch (error) {
    return `Equation solving error: ${error.message}`;
  }
};

export {availableTools};
export {toolFunctions};
