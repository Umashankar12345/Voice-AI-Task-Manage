require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));


app.post('/api/chat', async (req, res) => {
  console.log('Received body for Groq:', JSON.stringify(req.body));
  
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1000,
        messages: [
          { role: 'system', content: req.body.system },
          { role: 'user',   content: req.body.messages[0].content }
        ]
      })
    });

    const text = await response.text();
    console.log('Groq raw response:', text);

    try {
      const data = JSON.parse(text);
      res.json(data);
    } catch {
      res.status(500).json({ error: { message: 'Groq returned non-JSON' }, raw: text });
    }
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(500).json({ error: { message: err.message } });
  }
});

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`Proxy running on http://localhost:${PORT} (GROQ Mode)`);
  console.log(`Groq API key present: ${!!process.env.GROQ_API_KEY}`);
});
