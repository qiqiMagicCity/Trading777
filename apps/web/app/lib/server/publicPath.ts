import { existsSync } from "node:fs";
import path from "node:path";

export function getPublicPathCandidates(...segments: string[]): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, "public", ...segments),
    path.join(cwd, "apps/web/public", ...segments),
  ];
}

export function resolvePublicPath(...segments: string[]): string {
  const candidates = getPublicPathCandidates(...segments);
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
    const dir = path.dirname(candidate);
    if (existsSync(dir)) {
      return candidate;
    }
  }
  const message =
    `[resolvePublicPath] failed to locate public asset. Tried: ${candidates.join(", ")}`;
  const error = new Error(message) as NodeJS.ErrnoException & { candidates?: string[] };
  error.code = "ENOENT";
  error.candidates = candidates;
  throw error;
}
