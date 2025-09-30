import { jest } from '@jest/globals';

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    stat: jest.fn(),
    mkdir: jest.fn(),
  },
}));

import path from 'path';
import type { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import { POST } from '../close-price/route';

const readFileMock = fs.readFile as unknown as jest.MockedFunction<typeof fs.readFile>;
const writeFileMock = fs.writeFile as unknown as jest.MockedFunction<typeof fs.writeFile>;
const statMock = fs.stat as unknown as jest.MockedFunction<typeof fs.stat>;
const mkdirMock = fs.mkdir as unknown as jest.MockedFunction<typeof fs.mkdir>;

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
    statMock.mockReset();
    statMock.mockResolvedValue({
      isDirectory: () => true,
    } as unknown as import('fs').Stats);
    mkdirMock.mockReset();
    mkdirMock.mockResolvedValue(undefined);
  });

  it('persists close prices using symbol-first structure', async () => {
    readFileMock.mockRejectedValue(Object.assign(new Error('not found'), { code: 'ENOENT' }));

    const res = await POST(
      makeRequest({ symbol: 'aapl', date: '2024-05-20', close: '123.45' }),
    );

    expect(res.status).toBe(200);
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [filePath, payload] = writeFileMock.mock.calls[0]!;
    expect(statMock).toHaveBeenCalledWith(
      path.join(process.cwd(), 'apps/web/public'),
    );
    expect(mkdirMock).toHaveBeenCalledWith(
      path.join(process.cwd(), 'apps/web/public'),
      { recursive: true },
    );
    expect(filePath).toBe(
      path.join(process.cwd(), 'apps/web/public/close_prices.json'),
    );
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

  it('falls back to cwd/public when apps/web/public is missing', async () => {
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue('/tmp/app');
    statMock.mockImplementation(async (dir) => {
      if (dir === path.join('/tmp/app', 'apps/web/public')) {
        throw Object.assign(new Error('not found'), { code: 'ENOENT' });
      }

      return {
        isDirectory: () => true,
      } as unknown as import('fs').Stats;
    });
    readFileMock.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    await POST(makeRequest({ symbol: 'AAPL', date: '2024-05-20', close: 125 }));

    expect(statMock).toHaveBeenCalledWith(
      path.join('/tmp/app', 'apps/web/public'),
    );
    expect(readFileMock).toHaveBeenCalledWith(
      path.join('/tmp/app', 'public/close_prices.json'),
      'utf8',
    );
    expect(mkdirMock).toHaveBeenCalledWith(path.join('/tmp/app', 'public'), {
      recursive: true,
    });
    expect(writeFileMock).toHaveBeenCalledWith(
      path.join('/tmp/app', 'public/close_prices.json'),
      expect.any(String),
      'utf8',
    );

    cwdSpy.mockRestore();
  });
});
