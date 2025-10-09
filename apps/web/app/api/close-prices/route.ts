import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import {
  getPublicPathCandidates,
  resolvePublicPath,
} from '@/app/lib/server/publicPath';

const FILE_PATH = resolvePublicPath('close_prices.json');
const FILE_CANDIDATES = getPublicPathCandidates('close_prices.json');

export async function GET() {
  try {
    const content = await fs.readFile(FILE_PATH, 'utf8');
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const message = `close_prices.json not found. searched: ${FILE_CANDIDATES.join(', ')}`;
      return new NextResponse(message, { status: 404 });
    }
    console.error('[close-prices proxy] failed to read close_prices.json', error);
    const message = `failed to read close_prices.json. searched: ${FILE_CANDIDATES.join(', ')}`;
    return new NextResponse(message, { status: 500 });
  }
}
