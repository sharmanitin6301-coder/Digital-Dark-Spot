const http = require('http');

async function main() {
  console.log('Testing /api/health...');
  const healthRes = await fetch('http://127.0.0.1:3000/api/health');
  const healthJson = await healthRes.json();
  console.log('Health response:', healthJson);

  console.log('\nTesting /api/fetch-sources with sample.digitaldarkspot.local...');
  const fetchLocalRes = await fetch('http://127.0.0.1:3000/api/fetch-sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sources: [
        { id: 'S1', url: 'https://sample.digitaldarkspot.local/guide' },
        { id: 'S2', url: 'https://en.wikipedia.org/wiki/Scholarship' }
      ]
    })
  });
  const fetchLocalJson = await fetchLocalRes.json();
  console.log('Fetch local sources response:', JSON.stringify(fetchLocalJson, null, 2));

  console.log('\nTesting /api/fetch-sources with 2 public Wikipedia sources...');
  const fetchWikiRes = await fetch('http://127.0.0.1:3000/api/fetch-sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sources: [
        { id: 'S1', url: 'https://en.wikipedia.org/wiki/Scholarship' },
        { id: 'S2', url: 'https://en.wikipedia.org/wiki/Student_financial_aid_in_the_United_States' }
      ]
    })
  });
  const fetchWikiJson = await fetchWikiRes.json();
  console.log('Fetch wiki sources status:', fetchWikiRes.status);
  console.log('Sources count:', fetchWikiJson.sources?.length);
  fetchWikiJson.sources?.forEach(s => {
    console.log(`- ${s.id}: fetchStatus=${s.fetchStatus}, title="${s.title?.slice(0, 30)}", textLen=${s.text?.length}`);
  });

  console.log('\nTesting /api/analyze with 2 usable sources...');
  const analyzeRes = await fetch('http://127.0.0.1:3000/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: 'What are the main eligibility criteria and scholarship obligations?',
      sources: fetchWikiJson.sources
    })
  });
  const analyzeStatus = analyzeRes.status;
  const analyzeJson = await analyzeRes.json();
  console.log('Analyze response status:', analyzeStatus);
  console.log('Analyze response success:', analyzeJson.success);
  if (!analyzeJson.success) {
    console.log('Analyze response error:', analyzeJson.error);
  } else {
    console.log('Analyze response model_used:', analyzeJson.model_used);
    console.log('Analyze response is_fallback:', analyzeJson.is_fallback);
    console.log('Summary count:', analyzeJson.summary?.length);
    console.log('Gaps count:', analyzeJson.gaps?.length);
    console.log('Conflicts count:', analyzeJson.conflicts?.length);
    console.log('Checklist count:', analyzeJson.checklist?.length);
    console.log('Evidence verification stats:', analyzeJson.evidence_verification);
  }
}

main().catch(console.error);
