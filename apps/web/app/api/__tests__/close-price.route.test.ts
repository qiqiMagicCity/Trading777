import { jest } from '@jest/globals';

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
  },
}));

import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import { POST } from '../close-price/route';

const readFileMock = fs.readFile as unknown as jest.MockedFunction<typeof fs.readFile>;
const writeFileMock = fs.writeFile as unknown as jest.MockedFunction<typeof fs.writeFile>;

function makeRequest(body: Record<string, unknown>): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

describe('close price route', () => {
  beforeEach(() => {
    readFileMock.mockReset();
    writeFileMock.mockReset();
    writeFileMock.mockResolvedValue();
  });

  it('persists close prices using symbol-first structure', async () => {
    readFileMock.mockRejectedValue(Object.assign(new Error('not found'), { code: 'ENOENT' }));

    const res = await POST(
      makeRequest({ symbol: 'aapl', date: '2024-05-20', close: '123.45' }),
    );

    expect(res.status).toBe(200);
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [, payload] = writeFileMock.mock.calls[0]!;
    const data = JSON.parse(payload as string);
    expect(data).toEqual({ AAPL: { '2024-05-20': 123.45 } });
  });

  it('merges with existing symbol-first data', async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify({ AAPL: { '2024-05-19': 120.01 } }),
    );

    await POST(makeRequest({ symbol: 'AAPL', date: '2024-05-20', close: 125 }));

    const [, payload] = writeFileMock.mock.calls[0]!;
    const data = JSON.parse(payload as string);
    expect(data).toEqual({
      AAPL: { '2024-05-19': 120.01, '2024-05-20': 125 },
    });
  });

  it('normalises legacy date-first data before persisting', async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify({ '2024-05-19': { aapl: 120 } }),
    );

    await POST(makeRequest({ symbol: 'AAPL', date: '2024-05-20', close: 125 }));

    const [, payload] = writeFileMock.mock.calls[0]!;
    const data = JSON.parse(payload as string);
    expect(data).toEqual({
      AAPL: { '2024-05-19': 120, '2024-05-20': 125 },
    });
  });

  it('returns 400 when payload is invalid', async () => {
    readFileMock.mockRejectedValue(new Error('boom'));

    const res = await POST(makeRequest({ symbol: '', date: '2024-05-20', close: 'abc' }));

    expect(res.status).toBe(400);
    expect(writeFileMock).not.toHaveBeenCalled();
  });
});
