import { promises as fs } from 'fs';
import path from 'path';

async function directoryExists(dir: string): Promise<boolean> {
  try {
    const stats = await fs.stat(dir);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export async function resolvePublicFilePath(fileName: string): Promise<string> {
  const cwd = process.cwd();
  const preferAppPublic = process.env.VERCEL !== '1';

  if (preferAppPublic) {
    const preferredDir = path.join(cwd, 'apps/web/public');

    if (await directoryExists(preferredDir)) {
      return path.join(preferredDir, fileName);
    }
  }

  const fallbackDir = path.join(cwd, 'public');
  return path.join(fallbackDir, fileName);
}
