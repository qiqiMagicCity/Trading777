import { ZodSchema } from 'zod';

export function assertSchema<T>(data: unknown, schema: ZodSchema<T>): T {
  const res = schema.safeParse(data);
  if (res.success) return res.data;
  const msgs = res.error.errors.map(e => `${e.path.join('.') || '(root)'}: ${e.message}`).join('; ');
  throw new Error(`Schema validation failed: ${msgs}`);
}
