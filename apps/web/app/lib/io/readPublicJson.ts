import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Read a JSON file from the public directory with multiple fallbacks.
 * 1) Try reading from filesystem (apps/web/public or public)
 * 2) If missing or READ_PUBLIC_MODE=import, try dynamic import
 * 3) If PUBLIC_DATA_BASE is provided, fetch from remote URL
 * 4) If all methods fail, return the provided fallback value
 */
export async function readPublicJson<T>(rel: string, fallback: T): Promise<T> {
  const mode = process.env.READ_PUBLIC_MODE;
  const candidates = [
    path.join(process.cwd(), 'apps/web/public', rel),
    path.join(process.cwd(), 'public', rel),
  ];

  if (mode !== 'import') {
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          const text = fs.readFileSync(p, 'utf8');
          return JSON.parse(text) as T;
        }
      } catch (err: any) {
        if (err.code !== 'ENOENT') throw err;
      }
    }
  }

  for (const p of candidates) {
    try {
      const url = pathToFileURL(p);
      const mod = await import(url.href, { assert: { type: 'json' } });
      return mod.default as T;
    } catch {}
  }

  const base = process.env.PUBLIC_DATA_BASE;
  if (base) {
    try {
      const url = base.endsWith('/') ? `${base}${rel}` : `${base}/${rel}`;
      const res = await fetch(url);
      if (res.ok) return (await res.json()) as T;
    } catch {}
  }

  return fallback;
}
