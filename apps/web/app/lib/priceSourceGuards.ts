import { normalizeOfficialSourceTag } from "@/app/lib/prices/compareOfficialSourcePriority";

/**
 * @deprecated Prefer normalizeOfficialSourceTag / compareOfficialSourcePriority
 */
export function isOfficialCloseSource(src?: string | null): boolean {
  return normalizeOfficialSourceTag(src ?? null).startsWith("official/");
}
