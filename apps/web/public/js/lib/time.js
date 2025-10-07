const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function normalizeInput(input) {
  if (input == null) {
    return new Date();
  }
  if (input instanceof Date) {
    return new Date(input.getTime());
  }
  if (typeof input === "string" && DATE_ONLY_RE.test(input)) {
    return new Date(`${input}T12:00:00Z`);
  }
  return new Date(input);
}

export function ymdInNY(input) {
  const date = normalizeInput(input);
  if (Number.isNaN(date.getTime())) {
    return "Invalid Date";
  }
  return formatter.format(date);
}

if (typeof window !== "undefined") {
  window.ymdInNY = ymdInNY;
}
