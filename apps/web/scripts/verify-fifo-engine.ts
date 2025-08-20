import { consumeLots, type Lot } from '../app/lib/fifo-engine';

// Long path
const longLots: Lot[] = [{ qty: 30, price: 10, isToday: true }, { qty: 70, price: 8 }];
let seen: Array<[number, number]> = [];
let rem = consumeLots(longLots, 90, (use, lot) => { seen.push([use, lot.price]); });
console.log('long seen=', seen, 'rem=', rem);
if (JSON.stringify(seen) !== JSON.stringify([[30,10],[60,8]])) throw new Error('long sequence wrong');
if (rem !== 0) throw new Error('long remain should be 0');

// Short path
const shortLots: Lot[] = [{ qty: 20, price: 50, isToday: true }, { qty: 10, price: 55 }];
seen = [];
rem = consumeLots(shortLots, 25, (use, lot) => { seen.push([use, lot.price]); });
console.log('short seen=', seen, 'rem=', rem);
if (JSON.stringify(seen) !== JSON.stringify([[20,50],[5,55]])) throw new Error('short sequence wrong');
if (rem !== 0) throw new Error('short remain should be 0');

// Overflow case
const o: Lot[] = [{ qty: 5, price: 1 }];
rem = consumeLots(o, 9, () => {});
if (rem !== 4) throw new Error('overflow remain should be 4');

console.log('fifo engine verified ✅');
