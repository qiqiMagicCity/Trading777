let readyPromise: Promise<void> | null = null;
let resolved = false;

function ensureReadyPromise(): Promise<void> {
  if (resolved) {
    return Promise.resolve();
  }
  if (!readyPromise) {
    readyPromise = new Promise<void>((resolve) => {
      if (resolved) {
        resolve();
        return;
      }
      if (typeof window === "undefined") {
        resolved = true;
        resolve();
        return;
      }
      const handler = () => {
        resolved = true;
        window.removeEventListener("pricesReady", handler);
        resolve();
      };
      window.addEventListener("pricesReady", handler, { once: true });
      // Fallback: resolve on next tick to avoid blocking when no event is emitted yet.
      queueMicrotask(() => {
        if (!resolved) {
          resolved = true;
          window.removeEventListener("pricesReady", handler);
          resolve();
        }
      });
    });
  }
  return readyPromise;
}

export async function pricesReady(): Promise<void> {
  await ensureReadyPromise();
}

export function markPricesReady() {
  if (resolved) return;
  resolved = true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("pricesReady"));
  }
}
