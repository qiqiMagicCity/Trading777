import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const symbol = search.get('symbol');
  const resolution = search.get('resolution');
  const from = search.get('from');
  const to = search.get('to');

  if (!symbol || !resolution || !from || !to) {
    return new Response(
      JSON.stringify({ error: 'symbol, resolution, from and to are required' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  const token = process.env.FINNHUB_API_KEY;
  if (!token) {
    return new Response(JSON.stringify({ error: 'FINNHUB_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(
    symbol
  )}&resolution=${encodeURIComponent(resolution)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(
    to
  )}&token=${token}`;

  const resp = await fetch(url);
  const data = await resp.json();

  return new Response(JSON.stringify(data), {
    status: resp.status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
