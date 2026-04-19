require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));


app.post('/api/chat', async (req, res) => {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          max_tokens: 1000,
          messages: [
            { role: 'system', content: req.body.system },
            ...req.body.messages
          ]
        })
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error('Groq returned non-JSON: ' + text);
      }

      // If rate limited, wait and retry
      if (data.error?.message?.includes('Rate limit') || response.status === 429) {
        attempt++;
        const waitMs = attempt * 2000; // wait 2s, 4s, 6s
        console.log(`Rate limited. Retrying in ${waitMs}ms... (attempt ${attempt})`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      return res.json(data);

    } catch (err) {
      attempt++;
      console.error(`Attempt ${attempt} failed:`, err.message);
      if (attempt >= maxRetries) {
        return res.status(500).json({ error: { message: err.message } });
      }
      await new Promise(r => setTimeout(r, 1000)); // Small wait before retry on network error
    }
  }

  res.status(429).json({ 
    error: { message: 'Rate limit reached. Please wait 2 minutes and try again.' }
  });
});

if (process.env.NODE_ENV !== 'production') {
  const PORT = 3002;
  app.listen(PORT, () => {
    console.log(`Proxy running on http://localhost:${PORT} (GROQ Mode)`);
    console.log(`Groq API key present: ${!!process.env.GROQ_API_KEY}`);
  });
}

module.exports = app;
