import path from "node:path";

function isVercel() {
  return process.env.VERCEL === "1";
}

function publicBaseDir(): string {
  const base = process.env.PUBLIC_DATA_BASE;
  if (base) return base;
  return path.join(process.cwd(), "public");
}

async function tryFetchRemote<T>(rel: string): Promise<T | null> {
  const base = process.env.PUBLIC_DATA_BASE;
  if (!base || typeof fetch !== "function") return null;
  const url = base.endsWith("/") ? `${base}${rel}` : `${base}/${rel}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function tryDynamicImport<T>(absFile: string): Promise<T | null> {
  try {
    const { pathToFileURL } = await import("node:url");
    const url = pathToFileURL(absFile);
    // @ts-ignore: JSON import assertion for Node ESM
    const mod = await import(url.href, { assert: { type: "json" } });
    return (mod?.default ?? mod) as T;
  } catch {
    return null;
  }
}

export async function readPublicJson<T>(relPath: string, fallback: T): Promise<T> {
  // 线上（含 Vercel）绝不触盘：先试远程，失败就返回 fallback
  if (isVercel()) {
    const remote = await tryFetchRemote<T>(relPath);
    return remote ?? fallback;
  }

  // 本地/自托管：远程 → 动态 import → 磁盘
  const remote = await tryFetchRemote<T>(relPath);
  if (remote) return remote;

  const abs = path.join(publicBaseDir(), relPath);

  if (process.env.READ_PUBLIC_MODE === "import") {
    const viaImport = await tryDynamicImport<T>(abs);
    if (viaImport) return viaImport;
  }

  try {
    const fs = await import("node:fs/promises");
    const raw = await fs.readFile(abs, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
