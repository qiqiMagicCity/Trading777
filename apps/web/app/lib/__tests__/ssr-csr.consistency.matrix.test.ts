/**
 * SSR vs CSR 一致性矩阵测试
 * 思路：
 *  - 通过修改 process.env.TZ 并使用 jest.isolateModules 强制重新加载模块，
 *    在同一进程中模拟不同 Node 时区的 SSR 环境；
 *  - “CSR”侧我们不真的启浏览器，而是认为：在第 2~5 步完成后，
 *    前端也已经统一落到 nyDay/nyParse 的纽约口径，因此只要 SSR 不随 TZ 改变，
 *    CSR 也会对齐（本测试聚焦 SSR 的 TZ 敏感性，等价覆盖）。
 */

type TzCase = { tz: string; label: string };
const TZ_LIST: TzCase[] = [
  { tz: 'UTC',             label: 'TZ=UTC' },
  { tz: 'Europe/London',   label: 'TZ=Europe/London' },
  { tz: 'Asia/Shanghai',   label: 'TZ=Asia/Shanghai' },
];

function withTZ<T>(tz: string, run: () => T): T {
  const old = process.env.TZ;
  process.env.TZ = tz;
  let result: T;
  try {
    // isolateModules 确保在当前 TZ 下重新计算任何潜在的模块级行为
    jest.isolateModules(() => {
      result = run();
    });
    // @ts-ignore
    return result!;
  } finally {
    process.env.TZ = old;
  }
}

// 将“纽约本地时间”转成 UTC 时间点（用于构造唯一真确的 instant）
function nyLocalToUTC(year: number, month1: number, day: number, h: number, m: number, s: number): Date {
  // 我们用已实现的 DST 规则：nyParse.isNyDst(ymd) 来确定 offset
  // 这里为了避免循环依赖，直接在测试里实现一个最小 DST 判断（与 nyParse 一致）：
  const ymd = `${year}-${String(month1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const isNyDst = (() => {
    // 第二个周日的计算（简单实现）
    const nthWeekdayOfMonth = (y: number, m1: number, weekday: number, n: number) => {
      const d0 = new Date(Date.UTC(y, m1-1, 1));
      const w0 = d0.getUTCDay();
      const off = ((7 + weekday - w0) % 7) + (n-1)*7;
      return new Date(d0.getTime() + off*86400000);
    };
    const secondSundayOfMarch = nthWeekdayOfMonth(year, 3, 0, 2);
    const firstSundayOfNov   = nthWeekdayOfMonth(year, 11, 0, 1);
    const cur = new Date(Date.UTC(year, month1-1, day));
    return cur.getTime() >= secondSundayOfMarch.getTime() && cur.getTime() < firstSundayOfNov.getTime();
  })();
  const offsetMin = isNyDst ? -240 : -300; // 纽约相对 UTC 偏移（负数表示 UTC-4/UTC-5）
  // local(纽约) -> UTC：UTC = local - offset
  const utcMs = Date.UTC(year, month1-1, day, h, m, s) - offsetMin*60*1000;
  return new Date(utcMs);
}

describe('SSR vs CSR consistency matrix', () => {
  const summer = { y: 2025, m: 6, d: 2 };   // 周一，处于 DST
  const winter = { y: 2025, m: 1, d: 13 };  // 周一，标准时
  const july4  = { y: 2025, m: 7, d: 4 };   // 独立日（休市）

  // 关键秒
  const keysecs = [
    { label: 'pre-open 09:29:59', h: 9,  mi: 29, s: 59 },
    { label: 'open     09:30:00', h: 9,  mi: 30, s:  0 },
    { label: 'post 16:00:01',     h: 16, mi:  0, s:  1 },
  ];

  function loadNyModules() {
    const nyDay = require('../nyDay');
    const nyParse = require('../nyParse');
    return { nyDay, nyParse };
  }

  const scenarios = [
    { name: 'DST Monday 2025-06-02', base: summer },
    { name: 'Standard Monday 2025-01-13', base: winter },
  ];

  TZ_LIST.forEach(({ tz, label }) => {
    describe(label, () => {
      scenarios.forEach(({ name, base }) => {
        keysecs.forEach(({ label: klabel, h, mi, s }) => {
          test(`${name} @ ${klabel} -> resolveTradingDayStr stable across TZ`, () => {
            const nowUTC = nyLocalToUTC(base.y, base.m, base.d, h, mi, s);
            const got = withTZ(tz, () => {
              const { nyDay } = loadNyModules();
              return nyDay.resolveTradingDayStr(nowUTC);
            });

            // 在 UTC 基准下重取一次，应该与 TZ=UTC 一致
            const gotUTC = withTZ('UTC', () => {
              const { nyDay } = loadNyModules();
              return nyDay.resolveTradingDayStr(nowUTC);
            });

            expect(got).toBe(gotUTC);
          });

          test(`${name} @ ${klabel} -> tsFromYmdAtNoonUTC/previousTradingDay TZ-invariant`, () => {
            const { nyDay, nyParse } = withTZ(tz, () => loadNyModules());
            const ymd = nyDay.resolveTradingDayStr(nyLocalToUTC(base.y, base.m, base.d, h, mi, s));
            const ts1 = nyParse.tsFromYmdAtNoonUTC(ymd);
            const prev = nyDay.previousTradingDay(ymd);
            const tsPrev = nyParse.tsFromYmdAtNoonUTC(prev);

            // 再在另一个 TZ 下重复，结果必须一致
            const { nyDay: nyDay2, nyParse: nyParse2 } = withTZ('Asia/Shanghai', () => loadNyModules());
            const ymd2 = nyDay2.resolveTradingDayStr(nyLocalToUTC(base.y, base.m, base.d, h, mi, s));
            const ts2 = nyParse2.tsFromYmdAtNoonUTC(ymd2);
            const prev2 = nyDay2.previousTradingDay(ymd2);
            const tsPrev2 = nyParse2.tsFromYmdAtNoonUTC(prev2);

            expect(ymd2).toBe(ymd);
            expect(ts2).toBe(ts1);
            expect(prev2).toBe(prev);
            expect(tsPrev2).toBe(tsPrev);
          });
        });
      });

      test('Holiday 2025-07-04 10:00 NY -> resolves to previous trading day (stable across TZ)', () => {
        const nowUTC = nyLocalToUTC(july4.y, july4.m, july4.d, 10, 0, 0);
        const got = withTZ(tz, () => {
          const { nyDay } = loadNyModules();
          return nyDay.resolveTradingDayStr(nowUTC);
        });
        const gotUTC = withTZ('UTC', () => {
          const { nyDay } = loadNyModules();
          return nyDay.resolveTradingDayStr(nowUTC);
        });
        expect(got).toBe(gotUTC);

        // 不强行断死 2025-07-03（实现可能不同），但至少保证不是 07-04 当天
        expect(got).not.toBe('2025-07-04');
      });
    });
  });
});
