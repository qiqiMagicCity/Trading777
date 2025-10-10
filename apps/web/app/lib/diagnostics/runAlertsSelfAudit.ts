import { scanPackagedOnly, scanUnified } from "./alertsScan";
import { pushSample } from "./alertsBus";
import { collectUniverse } from "./universe";

export async function runOfficialCloseAudit(stage: 'SSR' | 'HYDRATE' | 'AFTER_EVENTS') {
  const universe = await collectUniverse('both');
  const unified = await scanUnified(universe);
  const packaged = await scanPackagedOnly(universe);
  pushSample({
    stage,
    kind: 'OfficialCloseBanner(unified)',
    reason: 'requireOfficialClose',
    inputs: universe,
    outputs: { count: unified.missing.length },
    missing: unified.missing,
    snapshotAt: Date.now(),
  });
  pushSample({
    stage,
    kind: 'OfficialCloseBanner(packaged-only)',
    reason: 'packaged-only',
    inputs: universe,
    outputs: { count: packaged.missing.length },
    missing: packaged.missing,
    snapshotAt: Date.now(),
  });
  return { unified, packaged };
}
