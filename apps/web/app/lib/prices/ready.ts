import {
  beginBuild,
  beginCommit,
  markReady,
  waitUntilAtLeast,
  current,
  withGateTrace,
  resetGateForTests,
} from "@/app/lib/readiness/priceReadyGate";

export { beginBuild, beginCommit, waitUntilAtLeast, current, withGateTrace };

export async function pricesReady(targetVersion?: number): Promise<void> {
  const snapshot = current();
  const target = typeof targetVersion === "number" ? targetVersion : snapshot.version;
  await waitUntilAtLeast(target);
}

export function markPricesReady(committedVersion?: number): void {
  markReady(committedVersion);
  if (typeof window !== "undefined") {
    const detail = { version: current().version };
    window.dispatchEvent(new CustomEvent("pricesReady", { detail }));
    window.dispatchEvent(new CustomEvent("pricesReadyAfterCommit", { detail }));
  }
}

export function resetPricesReadyForTests(): void {
  if (process.env.NODE_ENV !== "test") return;
  resetGateForTests();
}
