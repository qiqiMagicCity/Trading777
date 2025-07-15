
/**
 * historicalBackfill.js v1.0
 * One‑off script to fetch and store historical daily closing prices
 * for all tracked symbols since START_DATE.
 * Works inside the browser or Node (using fs).
 */
import { fetchDailyCandles, saveDailyClosesBulk, getTrackedSymbols } from './services/priceService.js';

const START_DATE = '2025-04-07';  // inclusive
const DELAY_PER_CALL_MS = 1200;   // <= 50 requests per minute

export async function runHistoricalBackfill(progressCallback = () => {}) {
  const symbols = await getTrackedSymbols();
  if (!symbols.length) {
    console.warn('[Backfill] No tracked symbols found.');
    return;
  }
  const startEpoch = Math.floor(new Date(START_DATE + 'T00:00:00Z').getTime() / 1000);
  const endEpoch = Math.floor(Date.now() / 1000);

  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    progressCallback({ symbol: sym, idx: i + 1, total: symbols.length });
    try {
      const candles = await fetchDailyCandles(sym, startEpoch, endEpoch);
      if (candles?.c?.length) {
        await saveDailyClosesBulk(sym, candles.t, candles.c);
        console.log('[Backfill] saved', sym, candles.c.length, 'days');
      } else {
        console.warn('[Backfill] empty candle', sym, candles);
      }
    } catch (e) {
      console.error('[Backfill] error', sym, e);
    }
    await new Promise(r => setTimeout(r, DELAY_PER_CALL_MS));
  }
  console.log('[Backfill] completed');
}

// CLI support (Node): `node js/historicalBackfill.js`
if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].includes('historicalBackfill.js')) {
  runHistoricalBackfill(msg => {
    process.stdout.write(`${msg.idx}/${msg.total} ${msg.symbol}\r`);
  }).then(() => process.exit(0));
}
