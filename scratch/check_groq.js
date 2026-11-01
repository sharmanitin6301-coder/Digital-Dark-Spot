require('dotenv').config();

const key = process.env.GROQ_API_KEY || process.env.XAI_API_KEY;

async function checkGroqModels() {
  console.log('Testing Groq API key: present=', Boolean(key), 'prefix=', key?.slice(0, 4));
  if (!key) return;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        'Authorization': `Bearer ${key.trim()}`
      }
    });

    console.log('Groq models status:', res.status);
    const data = await res.json();
    if (!res.ok) {
      console.log('Error:', data);
    } else {
      console.log('Models available:', data.data?.map(m => m.id));
      const hasGptOss = data.data?.some(m => m.id === 'openai/gpt-oss-120b');
      console.log('openai/gpt-oss-120b available:', hasGptOss);
    }
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}

checkGroqModels();
