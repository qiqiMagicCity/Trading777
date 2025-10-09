export function attachPricesImportedListener(reloader: () => void) {
  if (typeof window === "undefined") return;
  const handler = () => reloader();
  window.addEventListener("pricesImported", handler);
  return () => {
    window.removeEventListener("pricesImported", handler);
  };
}
