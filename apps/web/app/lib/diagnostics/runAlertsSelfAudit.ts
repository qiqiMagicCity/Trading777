import { filterMissingOfficialCloses } from "@/app/lib/prices/filterMissingOfficialCloses";
import { requireOfficialClose } from "@/app/lib/prices/officialCloseFacade";
import { pushAlertSample } from "./alertsSelfAudit";

export async function runOfficialCloseAudit(stage: 'SSR' | 'HYDRATE' | 'AFTER_EVENTS') {
  const missing = await filterMissingOfficialCloses({ requireOfficialClose });
  pushAlertSample({
    stage,
    kind: "OfficialCloseBanner",
    reason: "filterMissingOfficialCloses(requireOfficialClose)",
    sources: ["overlay", "official/import", "official/packaged", "idb"],
    missing,
  });
  return missing;
}
