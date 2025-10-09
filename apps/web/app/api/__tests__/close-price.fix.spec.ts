import { jest } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

interface MockRequestBody {
  [key: string]: unknown;
}

function makeRequest(body: MockRequestBody) {
  return {
    json: async () => body,
  } as any;
}

describe('close price API filesystem integration', () => {
  let tempRoot: string;
  let appDir: string;
  let restoreCwd: jest.SpiedFunction<typeof process.cwd> | null = null;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'close-price-api-'));
    appDir = path.join(tempRoot, 'apps/web');
    await fs.mkdir(path.join(appDir, 'public'), { recursive: true });
    restoreCwd = jest.spyOn(process, 'cwd').mockReturnValue(appDir);
    process.env.WRITEBACK_MODE = 'proxy';
    jest.resetModules();
  });

  afterEach(async () => {
    if (restoreCwd) {
      restoreCwd.mockRestore();
    }
    process.env.WRITEBACK_MODE = undefined;
    jest.resetModules();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('writes and reads close prices through API routes', async () => {
    const { POST, GET: getClosePrice } = await import('../close-price/route');
    const { GET: getClosePrices } = await import('../close-prices/route');

    const first = await POST(
      makeRequest({ symbol: 'AAPL', date: '2025-09-19', close: 189.12 }),
    );
    expect(first.status).toBe(200);

    const second = await POST(
      makeRequest({ symbol: 'MSFT', date: '2025-10-03', close: 329.44 }),
    );
    expect(second.status).toBe(200);

    const closePath = path.join(appDir, 'public/close_prices.json');
    const fileContent = await fs.readFile(closePath, 'utf8');
    const stored = JSON.parse(fileContent) as Record<string, Record<string, number>>;
    expect(stored).toEqual({
      AAPL: { '2025-09-19': 189.12 },
      MSFT: { '2025-10-03': 329.44 },
    });

    const getResponse = await getClosePrice({
      url: 'http://test.local/api/close-price',
    } as any);
    expect(getResponse.status).toBe(200);
    const getJson = (await getResponse.json()) as Record<string, Record<string, number>>;
    expect(getJson.AAPL).toBeDefined();
    expect(getJson.AAPL!['2025-09-19']).toBe(189.12);
    expect(getJson.MSFT).toBeDefined();
    expect(getJson.MSFT!['2025-10-03']).toBe(329.44);

    const proxyResponse = await getClosePrices();
    expect(proxyResponse.status).toBe(200);
    expect(proxyResponse.headers.get('Cache-Control')).toBe('no-store');
    const proxyJson = JSON.parse(
      await proxyResponse.text(),
    ) as Record<string, Record<string, number>>;
    expect(proxyJson.MSFT).toBeDefined();
    expect(proxyJson.MSFT!['2025-10-03']).toBe(329.44);
  });
});
