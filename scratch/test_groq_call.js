require('dotenv').config();

async function testGroqCall() {
  const key = process.env.GROQ_API_KEY;
  console.log('Testing Groq call with key len:', key?.length);

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key.trim()}`
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: 'You are an analyst. You must output a JSON object with a "test" boolean property.' },
          { role: 'user', content: 'Hello' }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2
      })
    });

    console.log('Status:', res.status);
    const json = await res.json();
    console.log('Response content:', json.choices?.[0]?.message?.content);
  } catch (err) {
    console.error('Error:', err);
  }
}

testGroqCall();
