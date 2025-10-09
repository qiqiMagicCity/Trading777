import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const FILE_PATH = path.join(process.cwd(), 'apps/web/public/close_prices.json');

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
      return new NextResponse('close_prices.json not found', { status: 404 });
    }
    console.error('[close-prices proxy] failed to read close_prices.json', error);
    return new NextResponse('internal error', { status: 500 });
  }
}
