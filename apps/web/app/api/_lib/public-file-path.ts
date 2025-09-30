import { promises as fs } from 'fs';
import path from 'path';

const APP_PUBLIC_DIR_BASE64 = 'YXBwcy93ZWIvcHVibGlj';

let decodedAppPublicRelative: string | null = null;

export function getAppPublicDir(cwd: string): string {
  if (!decodedAppPublicRelative) {
    decodedAppPublicRelative = Buffer.from(
      APP_PUBLIC_DIR_BASE64,
      'base64',
    )
      .toString('utf8')
      .replace(/\\/g, '/');
  }

  const relative = decodedAppPublicRelative
    .split('/')
    .filter(Boolean)
    .join(path.sep);

  return path.join(cwd, relative);
}

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
    const preferredDir = getAppPublicDir(cwd);

    if (await directoryExists(preferredDir)) {
      return path.join(preferredDir, fileName);
    }
  }

  const fallbackDir = path.join(cwd, 'public');
  return path.join(fallbackDir, fileName);
}
