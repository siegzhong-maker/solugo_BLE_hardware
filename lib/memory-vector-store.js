/**
 * In-memory vector store for RAG minimal runnable (9.8).
 * Shared across api/embed-and-store and api/retrieve in the same Node process.
 * Cold start / different Vercel instances = empty store; replace with Upstash or pgvector for persistence.
 */

const store = [];

/**
 * @param {{ id: string, content: string, embedding: number[], metadata?: Record<string, unknown> }} item
 */
export function add(item) {
  store.push(item);
  return item.id;
}

/**
 * @param {number[]} queryEmbedding
 * @param {{ cosineSimilarity: (a: number[], b: number[]) => number }} similarityFn
 * @param {number} topK
 * @returns {{ content: string, metadata?: Record<string, unknown> }[]}
 */
export function query(queryEmbedding, similarityFn, topK = 5) {
  const scored = store.map((item) => ({
    ...item,
    similarity: similarityFn(queryEmbedding, item.embedding),
  }));
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK).map(({ content, metadata }) => ({ content, metadata }));
}

export function size() {
  return store.length;
}

/**
 * 返回当前内存向量库的浅拷贝，仅用于调试与可视化。
 * 不要在调用方修改返回数组中的元素。
 */
export function getAll() {
  return [...store];
}
