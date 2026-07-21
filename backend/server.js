const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

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
    const { message, model = 'llama3.1' } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log(`Sending to Ollama (${model}): ${message}`);

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        prompt: message,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Ollama error:', errorText);
      return res.status(response.status).json({ error: 'Failed to communicate with Ollama' });
    }

    const data = await response.json();
    res.json({ response: data.response });
  } catch (error) {
    console.error('Error proxying to Ollama:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
