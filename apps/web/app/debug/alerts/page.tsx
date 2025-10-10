"use client";
import { useEffect, useState } from "react";
import { getDiagBus, type AlertSample } from "@/app/lib/diagnostics/alertsSelfAudit";
import { runOfficialCloseAudit } from "@/app/lib/diagnostics/runAlertsSelfAudit";

export default function Page() {
  const [rows, setRows] = useState<AlertSample[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    const bus = getDiagBus();
    // 初次也跑一次 HYDRATE 采样，随后手动跑“事件后采样”
    void runOfficialCloseAudit("HYDRATE");
    setRows(bus?.dump() ?? []);
  }, []);

  const recomputeAfterEvents = async () => {
    await runOfficialCloseAudit("AFTER_EVENTS");
    const bus = getDiagBus();
    setRows(bus?.dump() ?? []);
  };

  return (
    <div className="p-4 space-y-3">
      <h1 className="text-xl font-bold">Alerts Self-Check</h1>
      <div className="flex items-center gap-2">
        <button
          className="px-3 py-1 rounded bg-black text-white"
          onClick={recomputeAfterEvents}
        >
          重算（AFTER_EVENTS）
        </button>
      </div>
      <pre className="text-sm bg-gray-100 p-3 rounded">
        {JSON.stringify(rows, null, 2)}
      </pre>
      <p className="text-xs text-gray-500">{hydrated ? "hydrated" : "ssr"}</p>
    </div>
  );
}
