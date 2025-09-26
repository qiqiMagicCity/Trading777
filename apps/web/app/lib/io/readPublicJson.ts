import fs from "node:fs/promises";
import path from "node:path";

/**
 * 在 Vercel（或 READ_PUBLIC_MODE=none）环境下：
 * - 直接返回默认值（空对象/空数组等）
 * - 不访问 public 目录，从而避免 Next 把整个 public 打进函数包里
 * 本地/自托管则正常读写 public。
 */
function isDiskDisabled(): boolean {
  if (process.env.READ_PUBLIC_MODE === "none") return true;
  // Vercel 线上函数：为了避免把 public 整包进 lambda，禁用磁盘读取
  if (process.env.VERCEL === "1") return true;
  return false;
}

function publicBaseDir(): string {
  // 可自定义数据基目录；否则默认 apps/web/public（在本地/自托管）
  const base = process.env.PUBLIC_DATA_BASE;
  if (base) return base;
  // Next 在 apps/web 下运行，process.cwd() 指向此目录
  return path.join(process.cwd(), "public");
}

export async function readPublicJson<T>(relPath: string, fallback: T): Promise<T> {
  if (isDiskDisabled()) return fallback;
  try {
    const file = path.join(publicBaseDir(), relPath);
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writePublicJson(relPath: string, data: unknown): Promise<{ file: string; bytes: number }> {
  if (isDiskDisabled()) {
    // 线上不落盘：返回一个虚拟位置+长度，仅作观测
    const json = JSON.stringify(data);
    return { file: `[disabled:${relPath}]`, bytes: Buffer.byteLength(json, "utf8") };
  }
  const file = path.join(publicBaseDir(), relPath);
  const json = JSON.stringify(data, null, 2);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, json, "utf8");
  return { file, bytes: Buffer.byteLength(json, "utf8") };
}

/** 小工具：确保 JSON.parse 安全降级 */
export function parseJsonSafe<T>(raw: unknown, fallback: T): T {
  try {
    if (typeof raw === "string") return JSON.parse(raw) as T;
  } catch {}
  return fallback;
}
