/**
 * POST /api/retrieve
 * Minimal RAG (9.8): embed query with Gemini, top-k similarity search from memory store.
 * Body: { query, topK?: number }
 * Response: { memories: [{ content, metadata? }] } | { error }
 */
import { embed, cosineSimilarity } from 'ai';
import { google } from '@ai-sdk/google';
import { query } from '../lib/memory-vector-store.js';

const EMBED_MODEL = 'gemini-embedding-001';

export async function POST(request) {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'missing_api_key', message: 'GOOGLE_GENERATIVE_AI_API_KEY is not configured.' },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'invalid_body', message: 'Request body must be valid JSON.' },
      { status: 400 }
    );
  }

  const { query: queryText, topK = 5 } = body || {};
  if (!queryText || typeof queryText !== 'string') {
    return Response.json(
      { error: 'missing_fields', message: 'query (string) is required.' },
      { status: 400 }
    );
  }

  const k = Math.min(Math.max(1, Number(topK) || 5), 20);

  try {
    const model = google.embedding(EMBED_MODEL);
    const { embedding } = await embed({
      model,
      value: queryText,
    });

    const memories = query(embedding, cosineSimilarity, k);

    return Response.json({ memories });
  } catch (err) {
    console.error('[retrieve]', err);
    return Response.json(
      { error: 'retrieve_failed', message: err?.message || 'Retrieval failed.' },
      { status: 500 }
    );
  }
}
