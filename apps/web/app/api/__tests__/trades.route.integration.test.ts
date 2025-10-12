import { jest } from '@jest/globals';

jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn(),
  },
}));

import path from 'path';
import type { NextRequest } from 'next/server';

const ORIGINAL_TZ = process.env.TZ;

function makeRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as NextRequest;
}

async function loadRoute(tz?: string) {
  jest.resetModules();
  process.env.TZ = tz ?? ORIGINAL_TZ;
  const module = await import('../trades/route');
  const fsModule = (await import('fs')) as typeof import('fs');
  const writeFileMock = fsModule.promises
    .writeFile as jest.MockedFunction<typeof fsModule.promises.writeFile>;
  writeFileMock.mockReset();
  writeFileMock.mockResolvedValue();
  return { PUT: module.PUT, writeFileMock };
}

afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('trades persistence route', () => {
  it('normalises and sorts trade payloads before persisting', async () => {
    const { PUT, writeFileMock } = await loadRoute();
    const res = await PUT(
      makeRequest({
        trades: [
          {
            symbol: 'msft',
            price: '55.2',
            quantity: '10',
            date: '2024-05-22',
            action: 'SELL',
            time: '2024-05-22T14:30',
            id: '7',
          },
          {
            symbol: 'aapl',
            price: 123.45,
            quantity: 5,
            date: '2024-05-20',
            action: 'buy',
            time: '2024-05-20T09:30:05Z',
          },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [filePath, payload] = writeFileMock.mock.calls[0]!;
    const candidate = path.join(process.cwd(), 'public', 'trades.json');
    const expectedPath = candidate.includes(`${path.sep}apps${path.sep}web${path.sep}`)
      ? candidate
      : path.join(process.cwd(), 'apps', 'web', 'public', 'trades.json');
    expect(filePath).toBe(expectedPath);
    const data = JSON.parse(payload as string);
    expect(data).toEqual([
      {
        symbol: 'AAPL',
        price: 123.45,
        quantity: 5,
        date: '2024-05-20',
        action: 'buy',
        time: '2024-05-20T09:30:05',
      },
      {
        symbol: 'MSFT',
        price: 55.2,
        quantity: 10,
        date: '2024-05-22',
        action: 'sell',
        time: '2024-05-22T14:30:00',
        id: 7,
      },
    ]);
  });

  it('rejects invalid payloads', async () => {
    const { PUT, writeFileMock } = await loadRoute();
    const res = await PUT(makeRequest({ trades: [{ symbol: '', price: 1 }] }));
    expect(res.status).toBe(400);
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('supports top-level array payload', async () => {
    const { PUT, writeFileMock } = await loadRoute();
    await PUT(
      makeRequest([
        {
          symbol: 'googl',
          price: 10,
          quantity: 1,
          date: '2024-05-21',
          action: 'BUY',
        },
      ]),
    );

    const [, payload] = writeFileMock.mock.calls[0]!;
    const data = JSON.parse(payload as string);
    expect(data).toEqual([
      {
        symbol: 'GOOGL',
        price: 10,
        quantity: 1,
        date: '2024-05-21',
        action: 'buy',
        time: '2024-05-21T00:00:00',
      },
    ]);
  });

  it('handles Date payloads using New York timezone regardless of system tz', async () => {
    const { PUT, writeFileMock } = await loadRoute('UTC');
    const nyTimestamp = Date.UTC(2024, 4, 20, 13, 30, 5);

    const res = await PUT(
      makeRequest({
        trades: [
          {
            symbol: 'spy',
            price: 1,
            quantity: 1,
            date: '2024-05-20',
            action: 'buy',
            time: new Date(nyTimestamp),
          },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [, payload] = writeFileMock.mock.calls[0]!;
    const data = JSON.parse(payload as string);
    expect(data).toEqual([
      {
        symbol: 'SPY',
        price: 1,
        quantity: 1,
        date: '2024-05-20',
        action: 'buy',
        time: '2024-05-20T09:30:05',
      },
    ]);
  });
});
