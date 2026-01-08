/**
 * Test suite for Calliope's document collection and embedding system
 * 
 * Tests the collectDocs() function that gathers documentation for RAG
 * Uses Node.js built-in test runner (Node 18+)
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const proxyConfigAPI = require('../utils/proxyConfigAPI');

describe('Calliope Documentation Collection', () => {
  
  describe('collectDocs()', () => {
    
    test('should be defined and be a function', () => {
      assert.strictEqual(typeof proxyConfigAPI.collectDocs, 'function', 'collectDocs should be exported as a function');
    });
    
    test('should return an array of document objects', () => {
      const docs = proxyConfigAPI.collectDocs();
      
      assert.ok(Array.isArray(docs), 'collectDocs should return an array');
      assert.ok(docs.length > 0, 'collectDocs should return at least one document');
    });
    
    test('should include README.md in the collection', () => {
      const docs = proxyConfigAPI.collectDocs();
      
      const readme = docs.find(d => d.relPath === 'README.md');
      assert.ok(readme, 'Should include README.md');
      assert.ok(readme.content, 'README.md should have content');
      assert.ok(readme.content.length > 0, 'README.md content should not be empty');
    });
    
    test('should include CALLIOPE_ASSISTANT.md from docs/', () => {
      const docs = proxyConfigAPI.collectDocs();
      
      const calliope = docs.find(d => d.relPath === 'docs/CALLIOPE_ASSISTANT.md');
      assert.ok(calliope, 'Should include CALLIOPE_ASSISTANT.md');
      assert.ok(calliope.content.includes('Calliope'), 'Content should mention Calliope');
    });
    
    test('should include ARCHITECTURE.md from docs/', () => {
      const docs = proxyConfigAPI.collectDocs();
      
      const architecture = docs.find(d => d.relPath === 'docs/ARCHITECTURE.md');
      assert.ok(architecture, 'Should include ARCHITECTURE.md');
    });
    
    test('should include USER_GUIDE.md from docs/', () => {
      const docs = proxyConfigAPI.collectDocs();
      
      const userGuide = docs.find(d => d.relPath === 'docs/USER_GUIDE.md');
      assert.ok(userGuide, 'Should include USER_GUIDE.md');
    });
    
    test('should include CONFIGURATION.md from docs/', () => {
      const docs = proxyConfigAPI.collectDocs();
      
      const config = docs.find(d => d.relPath === 'docs/CONFIGURATION.md');
      assert.ok(config, 'Should include CONFIGURATION.md');
    });
    
    test('should include USER_GUIDE.md from docs/', () => {
      const docs = proxyConfigAPI.collectDocs();
      
      const userGuide = docs.find(d => d.relPath === 'docs/USER_GUIDE.md');
      assert.ok(userGuide, 'Should include USER_GUIDE.md');
    });
    
    test('should include PRODUCT.md from docs/', () => {
      const docs = proxyConfigAPI.collectDocs();
      
      const product = docs.find(d => d.relPath === 'docs/PRODUCT.md');
      assert.ok(product, 'Should include PRODUCT.md');
    });
    
    test('should include examples/README.md for example configurations', () => {
      const docs = proxyConfigAPI.collectDocs();
      
      const examplesReadme = docs.find(d => d.relPath === 'examples/README.md');
      assert.ok(examplesReadme, 'Should include examples/README.md');
    });
    
    test('should have all documents with required structure', () => {
      const docs = proxyConfigAPI.collectDocs();
      
      for (const doc of docs) {
        assert.ok(doc.relPath, 'Each doc should have a relPath property');
        assert.ok(doc.content, 'Each doc should have a content property');
        assert.strictEqual(typeof doc.relPath, 'string', 'relPath should be a string');
        assert.strictEqual(typeof doc.content, 'string', 'content should be a string');
      }
    });
    
    test('should only include .md files', () => {
      const docs = proxyConfigAPI.collectDocs();
      
      for (const doc of docs) {
        assert.ok(
          doc.relPath.endsWith('.md') || doc.relPath.endsWith('.MD'),
          `${doc.relPath} should be a markdown file`
        );
      }
    });
    
    test('should not include empty documents', () => {
      const docs = proxyConfigAPI.collectDocs();
      
      for (const doc of docs) {
        assert.ok(doc.content.length > 0, `${doc.relPath} should not have empty content`);
      }
    });
    
    test('should handle missing directories gracefully', () => {
      // Should not throw even if some directories don't exist
      assert.doesNotThrow(() => {
        proxyConfigAPI.collectDocs();
      }, 'collectDocs should handle missing directories gracefully');
    });
    
    test('should include at least 8 documentation files', () => {
      const docs = proxyConfigAPI.collectDocs();
      
      assert.ok(
        docs.length >= 8,
        `Should collect at least 8 docs, got ${docs.length}`
      );
      
      // Print out what we collected for debugging
      console.log(`\n  📚 Collected ${docs.length} documents:`);
      docs.forEach(d => console.log(`     - ${d.relPath} (${d.content.length} chars)`));
    });
    
    test('should provide enough context for answering common questions', () => {
      const docs = proxyConfigAPI.collectDocs();
      
      const allContent = docs.map(d => d.content.toLowerCase()).join(' ');
      
      // Check for key topics Calliope should know about
      assert.ok(allContent.includes('calliope'), 'Should include Calliope documentation');
      assert.ok(allContent.includes('nginx'), 'Should include nginx information');
      assert.ok(allContent.includes('docker'), 'Should include docker information');
      assert.ok(allContent.includes('proxy'), 'Should include proxy information');
      assert.ok(allContent.includes('route'), 'Should include routing information');
      assert.ok(allContent.includes('heal'), 'Should include healing capabilities');
    });
  });
  
  describe('Document Coverage', () => {
    
    test('should document Calliope\'s personality and capabilities', () => {
      const docs = proxyConfigAPI.collectDocs();
      
      const calliopeDoc = docs.find(d => d.relPath.includes('CALLIOPE'));
      assert.ok(calliopeDoc, 'Should have Calliope documentation');
      assert.ok(
        calliopeDoc.content.includes('Calliope') || 
        calliopeDoc.content.includes('AI'),
        'Calliope doc should describe the assistant'
      );
    });
    
    test('should document available API endpoints', () => {
      const docs = proxyConfigAPI.collectDocs();
      
      const apiDoc = docs.find(d => d.relPath.includes('CONFIGURATION') || d.relPath.includes('ENDPOINT'));
      assert.ok(apiDoc, 'Should have API/configuration documentation');
    });
    
    test('should document troubleshooting procedures', () => {
      const docs = proxyConfigAPI.collectDocs();
      
      const troubleshootDoc = docs.find(d => d.relPath.includes('USER_GUIDE') || d.relPath.includes('ARCHITECTURE'));
      assert.ok(troubleshootDoc, 'Should have user guide or architecture documentation');
    });
  });
  
  describe('chunkDocs()', () => {
    
    test('should be exported as a function', () => {
      assert.strictEqual(typeof proxyConfigAPI.chunkDocs, 'function');
    });
    
    test('should chunk documents into manageable pieces', () => {
      const docs = proxyConfigAPI.collectDocs();
      const chunks = proxyConfigAPI.chunkDocs(docs);
      
      assert.ok(Array.isArray(chunks), 'Should return an array');
      assert.ok(chunks.length > 0, 'Should return at least one chunk');
      
      console.log(`\n  ✂️  Created ${chunks.length} chunks from ${docs.length} documents`);
    });
    
    test('should create chunks with proper structure', () => {
      const docs = proxyConfigAPI.collectDocs();
      const chunks = proxyConfigAPI.chunkDocs(docs);
      
      for (const chunk of chunks) {
        assert.ok(chunk.id, 'Each chunk should have an id');
        assert.ok(chunk.source, 'Each chunk should have a source');
        assert.ok(chunk.text, 'Each chunk should have text');
        assert.ok(chunk.text.length <= 1200, 'Chunks should be <= 1200 characters');
      }
    });
    
    test('should handle empty documents array', () => {
      const chunks = proxyConfigAPI.chunkDocs([]);
      assert.strictEqual(chunks.length, 0, 'Empty input should return empty array');
    });
  });
});
