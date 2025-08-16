import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const FILE_PATH = path.join(process.cwd(), 'apps/web/public/close_prices.json');

export async function POST(req: NextRequest) {
  try {
    const { symbol, date, close } = await req.json();
    if (!symbol || !date || typeof close !== 'number') {
      return new Response(JSON.stringify({ error: 'symbol,date,close required' }), { status: 400 });
    }
    let data: Record<string, Record<string, number>> = {};
    try {
      const txt = await fs.readFile(FILE_PATH, 'utf8');
      data = JSON.parse(txt || '{}') as Record<string, Record<string, number>>;
    }
    // 文件可能不存在或 JSON 无法解析，此处忽略以便初始化为空对象
    // eslint-disable-next-line no-empty
    catch (_err) {
      // intentionally empty
    }
    if (!data[date]) data[date] = {};
    data[date][symbol] = close;
    await fs.writeFile(FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
    return new Response(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error('save close price error', err);
    return new Response(JSON.stringify({ error: 'internal error' }), { status: 500 });
  }
}

