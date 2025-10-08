export function isOfficialCloseSource(src?: string | null): boolean {
  if (!src) return false;
  const s = String(src).toLowerCase();
  if (s.includes("fallback") || s.includes("realtime") || s.includes("prev"))
    return false;
  return [
    "official",
    "exchange",
    "vendor",
    "manual",
    "import",
    "official_manual",
  ].some((k) => s.includes(k));
}
