/**
 * Integration test for Calliope's embedding and RAG system
 * 
 * Tests the full flow: collectDocs -> chunk -> embed -> query
 * Requires OPENAI_API_KEY to be set for embedding tests
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const proxyConfigAPI = require('../utils/proxyConfigAPI');

describe('Calliope Embeddings Integration', () => {
  
  test('can collect and chunk documents for embedding', () => {
    const docs = proxyConfigAPI.collectDocs();
    const chunks = proxyConfigAPI.chunkDocs(docs);
    
    console.log(`\n  📊 Statistics:`);
    console.log(`     Documents: ${docs.length}`);
    console.log(`     Chunks: ${chunks.length}`);
    console.log(`     Total characters: ${docs.reduce((sum, d) => sum + d.content.length, 0).toLocaleString()}`);
    console.log(`     Avg chunk size: ${Math.round(chunks.reduce((sum, c) => sum + c.text.length, 0) / chunks.length)} chars`);
    
    assert.ok(chunks.length > 0, 'Should create chunks');
    assert.ok(chunks.length >= docs.length, 'Should have at least as many chunks as docs');
  });
  
  test('chunks are properly sized for embedding API', () => {
    const docs = proxyConfigAPI.collectDocs();
    const chunks = proxyConfigAPI.chunkDocs(docs);
    
    const oversized = chunks.filter(c => c.text.length > 1200);
    assert.strictEqual(oversized.length, 0, 'No chunks should exceed 1200 characters');
    
    const tooSmall = chunks.filter(c => c.text.length < 50);
    const smallPercent = (tooSmall.length / chunks.length) * 100;
    
    console.log(`\n  📏 Chunk size distribution:`);
    console.log(`     < 50 chars: ${tooSmall.length} (${smallPercent.toFixed(1)}%)`);
    console.log(`     50-500 chars: ${chunks.filter(c => c.text.length >= 50 && c.text.length < 500).length}`);
    console.log(`     500-1000 chars: ${chunks.filter(c => c.text.length >= 500 && c.text.length < 1000).length}`);
    console.log(`     1000-1200 chars: ${chunks.filter(c => c.text.length >= 1000).length}`);
  });
  
  test('cosine similarity function works correctly', () => {
    // Test with known vectors
    const a = [1, 0, 0];
    const b = [1, 0, 0];
    const c = [0, 1, 0];
    
    const similaritySame = proxyConfigAPI.cosine(a, b);
    const similarityDifferent = proxyConfigAPI.cosine(a, c);
    
    assert.ok(similaritySame > 0.99, 'Identical vectors should have similarity ~1');
    assert.ok(similarityDifferent < 0.01, 'Orthogonal vectors should have similarity ~0');
    
    console.log(`\n  🧮 Cosine similarity test:`);
    console.log(`     Same vectors: ${similaritySame.toFixed(4)}`);
    console.log(`     Orthogonal vectors: ${similarityDifferent.toFixed(4)}`);
  });
  
  test('chunks preserve document source information', () => {
    const docs = proxyConfigAPI.collectDocs();
    const chunks = proxyConfigAPI.chunkDocs(docs);
    
    const sources = new Set(chunks.map(c => c.source));
    
    console.log(`\n  📚 Source coverage:`);
    sources.forEach(source => {
      const count = chunks.filter(c => c.source === source).length;
      console.log(`     ${source}: ${count} chunks`);
    });
    
    assert.strictEqual(sources.size, docs.length, 'All documents should be represented in chunks');
  });
  
  test('chunks include relevant Calliope information', () => {
    const docs = proxyConfigAPI.collectDocs();
    const chunks = proxyConfigAPI.chunkDocs(docs);
    
    const calliopeChunks = chunks.filter(c => 
      c.source.includes('CALLIOPE') && c.text.toLowerCase().includes('calliope')
    );
    
    const healingChunks = chunks.filter(c => 
      c.text.toLowerCase().includes('heal') || c.text.toLowerCase().includes('fix')
    );
    
    const apiChunks = chunks.filter(c => 
      c.text.toLowerCase().includes('/api/') || c.text.toLowerCase().includes('endpoint')
    );
    
    console.log(`\n  🔍 Content analysis:`);
    console.log(`     Calliope chunks: ${calliopeChunks.length}`);
    console.log(`     Healing-related chunks: ${healingChunks.length}`);
    console.log(`     API-related chunks: ${apiChunks.length}`);
    
    assert.ok(calliopeChunks.length > 0, 'Should have Calliope information');
    assert.ok(healingChunks.length > 0, 'Should have healing information');
    assert.ok(apiChunks.length > 0, 'Should have API information');
  });
});

describe('Document Quality Checks', () => {
  
  test('documents cover all essential topics', () => {
    const docs = proxyConfigAPI.collectDocs();
    const allText = docs.map(d => d.content.toLowerCase()).join(' ');
    
    const essentialTopics = {
      'Calliope personality': /calliope.*personality|personality.*calliope|youthful|caring/i,
      'Self-healing': /self.*heal|heal.*self|auto.*heal|healing.*system/i,
      'API endpoints': /\/api\/|endpoint|POST|GET/i,
      'Nginx configuration': /nginx|reverse proxy|location.*block/i,
      'Docker containers': /docker|container|docker-compose/i,
      'Route management': /route|routing|proxy_pass/i,
      'Error handling': /error|troubleshoot|debug|fix/i,
      'Configuration': /config|configuration|setup/i
    };
    
    console.log(`\n  ✅ Topic coverage:`);
    for (const [topic, regex] of Object.entries(essentialTopics)) {
      const covered = regex.test(allText);
      console.log(`     ${covered ? '✓' : '✗'} ${topic}`);
      assert.ok(covered, `Should cover: ${topic}`);
    }
  });
  
  test('documentation is substantial enough for RAG', () => {
    const docs = proxyConfigAPI.collectDocs();
    const totalChars = docs.reduce((sum, d) => sum + d.content.length, 0);
    const totalWords = docs.reduce((sum, d) => sum + d.content.split(/\s+/).length, 0);
    
    console.log(`\n  📊 Documentation size:`);
    console.log(`     Total characters: ${totalChars.toLocaleString()}`);
    console.log(`     Total words: ${totalWords.toLocaleString()}`);
    console.log(`     Average doc size: ${Math.round(totalChars / docs.length).toLocaleString()} chars`);
    
    assert.ok(totalChars > 50000, 'Should have substantial documentation (>50k chars)');
    assert.ok(totalWords > 7000, 'Should have substantial documentation (>7k words)');
  });
});

