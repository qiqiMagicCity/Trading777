import { jest } from '@jest/globals';

jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn(),
  },
}));

import path from 'path';
import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import { PUT } from '../trades/route';

const writeFileMock = fs.writeFile as unknown as jest.MockedFunction<typeof fs.writeFile>;

function makeRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as NextRequest;
}

describe('trades persistence route', () => {
  beforeEach(() => {
    writeFileMock.mockReset();
    writeFileMock.mockResolvedValue();
  });

  it('normalises and sorts trade payloads before persisting', async () => {
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
    expect(filePath).toBe(
      path.join(process.cwd(), 'apps/web/public/trades.json'),
    );
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
    const res = await PUT(makeRequest({ trades: [{ symbol: '', price: 1 }] }));
    expect(res.status).toBe(400);
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('supports top-level array payload', async () => {
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
});
