# Calliope's Knowledge Base & RAG System

Calliope uses a Retrieval-Augmented Generation (RAG) system to access internal documentation and provide accurate answers about her capabilities, configuration, and troubleshooting procedures.

## Overview

The RAG system works in three stages:

1. **Document Collection** - Gathers all markdown documentation
2. **Chunking & Embedding** - Splits docs into chunks and creates vector embeddings
3. **Semantic Search** - Retrieves relevant context for user queries

## Architecture

```
┌─────────────────────┐
│  Documentation      │
│  (Markdown files)   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  collectDocs()      │
│  - README.md        │
│  - docs/*.md        │
│  - examples/*.md    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  chunkDocs()        │
│  - 1200 char chunks │
│  - Preserve source  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  embedChunks()      │
│  - OpenAI API       │
│  - text-embedding-  │
│    3-small          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Vector Index       │
│  .artifacts/        │
│  ai-embeddings.json │
└─────────────────────┘
```

## Documents Included

### Core Documentation (9 documents, ~97k chars)
- `README.md` - Main project documentation
- `docs/CALLIOPE-AI-ASSISTANT.md` - Calliope's capabilities
- `docs/CALLIOPE-PERSONALITY.md` - Her personality traits
- `docs/CALLIOPE-NEXTAUTH-PROXY-FIX.md` - Specific fix documentation
- `docs/TROUBLESHOOTING.md` - Common issues and solutions
- `docs/CONFIG-MANAGEMENT-GUIDE.md` - Configuration best practices
- `docs/API-ENDPOINTS.md` - API reference
- `docs/PROJECT-INTEGRATION.md` - Integration guide
- `examples/README.md` - Example configurations

### Knowledge Coverage

The embeddings provide Calliope with knowledge about:

✅ **Her personality** - Youthful, caring, proactive traits  
✅ **Self-healing capabilities** - Automatic fix strategies  
✅ **API endpoints** - All available endpoints and usage  
✅ **Nginx configuration** - Reverse proxy setup and issues  
✅ **Docker containers** - Container management  
✅ **Route management** - Proxy routing and configuration  
✅ **Error handling** - Troubleshooting procedures  
✅ **Configuration** - Setup and best practices  

## Usage

### Building the Index

**Option 1: Via API (Recommended)**
```bash
curl -X POST http://localhost:3001/api/ai/reindex
```

**Option 2: Programmatically**
```javascript
const proxyConfigAPI = require('./utils/proxyConfigAPI');

const docs = proxyConfigAPI.collectDocs();
const chunks = proxyConfigAPI.chunkDocs(docs);
const embeddings = await proxyConfigAPI.embedChunks(chunks, 'text-embedding-3-small');

proxyConfigAPI.saveEmbeddings({
  model: 'text-embedding-3-small',
  createdAt: new Date().toISOString(),
  chunks: embeddings
});
```

### Querying with Context

When users ask Calliope questions, the system:

1. Embeds the user's query
2. Performs cosine similarity search against all chunks
3. Retrieves top-K most relevant chunks
4. Includes them as context in the prompt to OpenAI

```javascript
// In /api/ai/ask endpoint
const queryVector = await embedText(userQuery, embedModel);
const relevantDocs = rankByVector(index, queryVector, 5);
// relevantDocs includes the most relevant documentation chunks
```

### Checking Index Status

```bash
# Check if index exists and get stats
curl http://localhost:3001/api/ai/stats
```

Response:
```json
{
  "exists": true,
  "model": "text-embedding-3-small",
  "chunks": 85,
  "dim": 1536
}
```

## Statistics

From our test suite:

- **Documents**: 9 markdown files
- **Total Size**: 96,685 characters (~12,097 words)
- **Chunks Created**: 85 chunks
- **Average Chunk Size**: 1,137 characters
- **Embedding Model**: text-embedding-3-small (1536 dimensions)

### Chunk Distribution

- **< 50 chars**: 0 (0%)
- **50-500 chars**: 4 chunks
- **500-1000 chars**: 3 chunks
- **1000-1200 chars**: 78 chunks (optimal size)

### Content Analysis

- **Personality chunks**: 4 (defining her character)
- **Healing-related chunks**: 62 (fix procedures)
- **API-related chunks**: 47 (endpoint documentation)

## Implementation Details

### Document Collection (`collectDocs()`)

```javascript
function collectDocs() {
  const docs = [];
  
  // Explicitly include key documents
  addDoc(README, 'README.md');
  addDoc(path.join(DOCS_DIR, 'CALLIOPE-AI-ASSISTANT.md'), 'docs/CALLIOPE-AI-ASSISTANT.md');
  // ... etc
  
  // Scan for additional markdown files
  // Handles missing directories gracefully
  
  return docs;
}
```

**Features:**
- ✅ Graceful handling of missing files
- ✅ Automatic scanning of docs/ and examples/ directories
- ✅ Deduplication to avoid double-counting
- ✅ UTF-8 encoding support
- ✅ Empty file filtering

### Chunking Strategy (`chunkDocs()`)

**Chunk Size**: 1200 characters (approximately 300 tokens)

**Why 1200 chars?**
- Fits comfortably in embedding API limits
- Large enough to preserve context
- Small enough for precise retrieval
- Optimal for semantic search accuracy

**Chunking Method**: Fixed-size overlapping windows
- Each chunk maintains source reference
- Preserves document context
- Enables traceability back to source

### Semantic Search (`rankByVector()`)

**Algorithm**: Cosine similarity

```javascript
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}
```

**Returns**: Top-K most similar chunks, sorted by relevance

## Testing

### Unit Tests

```bash
# Test document collection and chunking
node --test test/collect-docs.test.js
```

**Test Coverage:**
- ✅ 23 tests covering all core functionality
- ✅ Document structure validation
- ✅ Content verification
- ✅ Error handling
- ✅ Edge cases

### Integration Tests

```bash
# Test full embedding pipeline
node --test test/calliope-embeddings-integration.test.js
```

**Test Coverage:**
- ✅ 7 tests for end-to-end workflow
- ✅ Chunk size validation
- ✅ Content analysis
- ✅ Topic coverage verification
- ✅ Quality metrics

### Run All Tests

```bash
# Run both test suites
node --test test/collect-docs.test.js test/calliope-embeddings-integration.test.js
```

## Maintenance

### When to Reindex

Rebuild the embeddings index when:

- 📝 Documentation is updated
- 🆕 New markdown files are added
- 🔧 Configuration guides change
- 🎯 Calliope's capabilities expand

### Index Location

```
.artifacts/ai-embeddings.json
```

**Format:**
```json
{
  "model": "text-embedding-3-small",
  "createdAt": "2025-01-15T10:30:00.000Z",
  "dim": 1536,
  "chunks": [
    {
      "id": "sha1-hash",
      "source": "docs/CALLIOPE-PERSONALITY.md",
      "text": "Calliope is your dev tunnel proxy's voice...",
      "vector": [0.123, -0.456, ...]
    }
  ]
}
```

## Cost Optimization

### Embedding Costs

Using **text-embedding-3-small**:
- **Cost**: $0.02 per 1M tokens
- **Current docs**: ~12k words (~16k tokens)
- **Cost per index**: ~$0.0003 (negligible)

### Query Costs

- Each query requires 1 embedding call
- Cost per query: ~$0.00001
- 1000 queries: ~$0.01

**Recommendation**: Reindex liberally; it's very cheap!

## Future Enhancements

### Planned Improvements

1. **Incremental Updates** - Only re-embed changed documents
2. **Hybrid Search** - Combine semantic + keyword search
3. **Caching** - Cache frequent query embeddings
4. **Compression** - Quantize vectors for smaller index size
5. **Metadata Filtering** - Filter by doc type or category
6. **Multi-language** - Support for non-English docs

### Advanced Features

- **Question Answering Mode** - Direct answer extraction
- **Summarization** - Auto-summarize long documents
- **Citation Tracking** - Link answers to source docs
- **Feedback Loop** - Learn from query success/failure

## Troubleshooting

### Index Not Found

```bash
# Build the index
curl -X POST http://localhost:3001/api/ai/reindex
```

### Empty Results

Check index stats:
```bash
curl http://localhost:3001/api/ai/stats
```

Verify OPENAI_API_KEY is set:
```bash
echo $OPENAI_API_KEY
```

### Outdated Information

Rebuild the index after doc changes:
```bash
curl -X POST http://localhost:3001/api/ai/reindex
```

---

**Built with TDD** ✅  
All functionality is thoroughly tested with comprehensive unit and integration tests.

