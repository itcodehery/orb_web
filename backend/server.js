require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const { tavily } = require('@tavily/core');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Tavily client
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

app.use(cors());
app.use(express.json());

// Proxy endpoint for local Ollama models
app.get('/api/models', async (req, res) => {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch models from Ollama' });
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Failed to connect to local Ollama instance' });
  }
});

// Proxy endpoint for local Ollama chat
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model = 'llama3.1', tools, systemPrompt } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const systemMessage = systemPrompt ? [{ role: 'system', content: systemPrompt }] : [];
    
    const requestBody = {
      model: model,
      messages: [...systemMessage, ...messages],
      stream: true,
    };
    
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }

    console.log(`Sending to Ollama (${model}) with ${messages.length} messages, ${tools?.length || 0} tools.`);

    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Ollama error:', errorText);
      return res.status(response.status).json({ error: 'Failed to communicate with Ollama' });
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');

    for await (const chunk of response.body) {
      res.write(chunk);
    }
    res.end();
  } catch (error) {
    console.error('Error proxying to Ollama:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint to execute tools from the backend
app.post('/api/execute_tool', async (req, res) => {
  try {
    const { tool_name, arguments } = req.body;
    
    console.log(`Executing tool: ${tool_name} with args:`, arguments);
    
    if (tool_name === 'execute_bash') {
      const command = arguments.command;
      exec(command, (error, stdout, stderr) => {
        let result = '';
        if (stdout) result += stdout;
        if (stderr) result += stderr;
        if (error) result += `\nError code: ${error.code}`;
        res.json({ result: result.trim() || 'Command executed with no output.' });
      });
      return;
    } 
    
    if (tool_name === 'read_file') {
      const filepath = arguments.filepath;
      try {
        const content = fs.readFileSync(filepath, 'utf-8');
        res.json({ result: content.substring(0, 5000) }); // limit length
      } catch (err) {
        res.json({ result: `Failed to read file: ${err.message}` });
      }
      return;
    }
    
    if (tool_name === 'web_search') {
      const query = arguments.query;
      try {
        const searchResponse = await tvly.search(query, { searchDepth: "basic", maxResults: 5 });
        const resultsText = searchResponse.results
          .map(r => `Title: ${r.title}\nURL: ${r.url}\nContent: ${r.content}`)
          .join('\n\n');
        res.json({ result: resultsText || 'No results found.' });
      } catch (err) {
        res.json({ result: `Failed to search web: ${err.message}` });
      }
      return;
    }

    res.status(400).json({ error: `Unknown tool: ${tool_name}` });
  } catch (error) {
    console.error('Error executing tool:', error);
    res.status(500).json({ error: 'Internal server error while executing tool' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
