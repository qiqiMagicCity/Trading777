const HIGH_PRIORITY_TAGS = new Set<string>([
  "official/import",
  "official/manual",
  "official/vendor",
  "official/exchange",
]);

function sanitizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, "/")
    .replace(/\/+/g, "/")
    .replace(/\/+$/g, "")
    .replace(/^\/+/, "");
}

export function normalizeOfficialSourceTag(source: string | null | undefined): string {
  const base = typeof source === "string" ? sanitizeTag(source) : "";
  if (!base) {
    return "unknown";
  }
  if (base === "official") {
    return "official/import";
  }
  if (base === "import" || base === "official/import") {
    return "official/import";
  }
  if (base === "manual" || base === "official/manual") {
    return "official/manual";
  }
  if (base === "vendor" || base === "official/vendor") {
    return "official/vendor";
  }
  if (base === "exchange" || base === "official/exchange") {
    return "official/exchange";
  }
  if (base === "packaged" || base === "official/packaged") {
    return "official/packaged";
  }
  if (base.startsWith("official/")) {
    return base;
  }
  if (
    base.startsWith("fallback/") ||
    base.startsWith("realtime/") ||
    base.startsWith("prev/")
  ) {
    return base;
  }
  return "unknown";
}

function getPriority(tag: string | null | undefined): number {
  const normalized = normalizeOfficialSourceTag(tag);
  if (HIGH_PRIORITY_TAGS.has(normalized)) {
    return 0;
  }
  if (normalized === "official/packaged") {
    return 1;
  }
  return 2;
}

export function compareOfficialSourcePriority(a: string | null | undefined, b: string | null | undefined): number {
  const priorityA = getPriority(a);
  const priorityB = getPriority(b);
  if (priorityA < priorityB) return -1;
  if (priorityA > priorityB) return 1;
  return 0;
}

export function isHigherPriority(newTag: string | null | undefined, oldTag: string | null | undefined): boolean {
  return compareOfficialSourcePriority(newTag, oldTag) < 0;
}
