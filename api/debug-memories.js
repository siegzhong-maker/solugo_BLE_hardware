/**
 * GET /api/debug-memories
 * 只读调试接口：返回当前向量记忆池的总数与最近 N 条记忆，用于可视化展示。
 *
 * Response:
 * { ok: true, total: number, memories: [{ id, content, location?, date? }] }
 */
import { getAll, size } from '../lib/memory-vector-store.js';

const DEFAULT_LIMIT = 20;

export async function GET() {
  try {
    const total = size();
    const all = getAll();
    const latest = all.slice(-DEFAULT_LIMIT).reverse();

    const memories = latest.map((item) => {
      const metadata = item.metadata || {};
      return {
        id: item.id,
        content: item.content,
        location: metadata.location || '',
        date: metadata.date || ''
      };
    });

    return Response.json({
      ok: true,
      total,
      memories
    });
  } catch (err) {
    console.error('[debug-memories]', err);
    return Response.json(
      { ok: false, error: 'debug_failed', message: err?.message || 'Debug retrieval failed.' },
      { status: 500 }
    );
  }
}

