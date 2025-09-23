import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';

const ORIGINAL_CWD = process.cwd();

async function setupTempProject() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'close-price-'));
  await fs.mkdir(path.join(tmp, 'apps/web/public'), { recursive: true });
  process.chdir(tmp);
  jest.resetModules();
  return tmp;
}

async function cleanupTempProject(tmp: string | null) {
  process.chdir(ORIGINAL_CWD);
  if (tmp) {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

describe('POST /api/close-price', () => {
  let tmp: string | null = null;

  beforeEach(async () => {
    tmp = await setupTempProject();
  });

  afterEach(async () => {
    await cleanupTempProject(tmp);
    tmp = null;
  });

  it('追加同一标的的收盘价而不覆盖既有数据', async () => {
    const filePath = path.join(process.cwd(), 'apps/web/public/close_prices.json');
    await fs.writeFile(
      filePath,
      JSON.stringify({ AAPL: { '2024-05-20': 190 } }, null, 2),
      'utf8',
    );

    const { POST } = await import('../route');
    const res = await POST({ json: async () => ({ symbol: 'AAPL', date: '2024-05-21', close: 195 }) } as any);

    expect(res.ok).toBe(true);
    const saved = JSON.parse(await fs.readFile(filePath, 'utf8'));
    expect(saved).toEqual({ AAPL: { '2024-05-20': 190, '2024-05-21': 195 } });
  });

  it('能自动修复日期作为顶层键的遗留数据结构', async () => {
    const filePath = path.join(process.cwd(), 'apps/web/public/close_prices.json');
    await fs.writeFile(
      filePath,
      JSON.stringify({ '2024-05-20': { AAPL: '190' }, '2024-05-21': { msft: '300' } }, null, 2),
      'utf8',
    );

    const { POST } = await import('../route');
    await POST({ json: async () => ({ symbol: ' msft ', date: '2024-05-22T00:00:00Z', close: 310 }) } as any);

    const saved = JSON.parse(await fs.readFile(filePath, 'utf8'));
    expect(saved).toEqual({
      AAPL: { '2024-05-20': 190 },
      MSFT: { '2024-05-21': 300, '2024-05-22': 310 },
    });
  });
});

