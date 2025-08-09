import { toNY } from './timezone';

export const startOfDayNY = (input: string | number | Date): Date => {
  const d = toNY(input);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const endOfDayNY = (input: string | number | Date): Date => {
  const d = toNY(input);
  d.setHours(23, 59, 59, 999);
  return d;
};

export { toNY };
