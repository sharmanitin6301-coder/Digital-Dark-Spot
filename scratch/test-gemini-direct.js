require('dotenv').config();
const { generateAnalysis } = require('../services/geminiService');

async function testCall() {
  const sources = [
    { id: 'S1', url: 'http://s1', text: 'Applicants are eligible for merit scholarship up to $30,000 family income. Deadline is Nov 30.', fetchStatus: 'success' },
    { id: 'S2', url: 'http://s2', text: 'Counselors report income limit may be $40,000 under special quota. Must keep 3.0 GPA.', fetchStatus: 'success' }
  ];

  try {
    const res = await generateAnalysis('What are the scholarship conditions?', sources);
    console.log('generateAnalysis SUCCESS, modelUsed:', res.modelUsed);
  } catch (err) {
    console.error('generateAnalysis ERROR:', err.status, err.message);
  }
}

testCall();
