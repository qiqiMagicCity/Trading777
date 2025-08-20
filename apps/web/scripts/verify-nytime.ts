import { isSameNYDay, nyDateStr } from '../app/lib/time';

console.log('nyDateStr(2025-08-01T13:00:00Z)=', nyDateStr('2025-08-01T13:00:00Z'));
if (!isSameNYDay('2025-08-01T13:00:00Z', '2025-08-01T21:00:00Z')) {
  throw new Error('isSameNYDay failed on same NY day');
}
console.log('NY time utils verified ✅');
