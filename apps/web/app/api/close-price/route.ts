import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

import { normalizeClosePriceData, sortClosePriceMap } from '@/app/lib/closePrices';

const FILE_PATH = path.join(process.cwd(), 'apps/web/public/close_prices.json');

export async function POST(req: NextRequest) {
  try {
    const { symbol, date, close } = await req.json();
    const symbolKey = typeof symbol === 'string' ? symbol.trim().toUpperCase() : '';
    const rawDate = typeof date === 'string' ? date.trim() : '';
    const dateKey = rawDate.includes('T') ? rawDate.slice(0, 10) : rawDate;
    if (!symbolKey || !dateKey || typeof close !== 'number' || !Number.isFinite(close)) {
      return new Response(JSON.stringify({ error: 'symbol,date,close required' }), { status: 400 });
    }

    let rawData: unknown = {};
    try {
      const txt = await fs.readFile(FILE_PATH, 'utf8');
      rawData = JSON.parse(txt || '{}');
    }
    // 文件可能不存在或 JSON 无法解析，此处忽略以便初始化为空对象
    // eslint-disable-next-line no-empty
    catch (_err) {
      // intentionally empty
    }

    const data = normalizeClosePriceData(rawData);
    (data[symbolKey] ??= {})[dateKey] = close;

    await fs.writeFile(FILE_PATH, JSON.stringify(sortClosePriceMap(data), null, 2), 'utf8');
    return new Response(JSON.stringify({ ok: true }));
  } catch (err) {
    console.error('save close price error', err);
    return new Response(JSON.stringify({ error: 'internal error' }), { status: 500 });
  }
}

