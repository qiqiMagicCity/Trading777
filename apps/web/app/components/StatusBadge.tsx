import React from 'react';
export type Status = 'live' | 'stale';
const TOKENS = {
  live:  { dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'ring-emerald-500/30', bg: 'bg-emerald-500/10' },
  stale: { dot: 'bg-amber-400',   text: 'text-amber-300',   ring: 'ring-amber-500/30', bg: 'bg-amber-500/10' },
};
export const StatusBadge: React.FC<{ status: Status }> = ({ status }) => {
  const t = TOKENS[status];
  return (
    <div className="flex justify-center mb-2">
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${t.text} ${t.ring} ${t.bg} ring-1`} aria-live="polite">
        <span className="relative flex h-2.5 w-2.5">
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-40 motion-safe:animate-ping ${t.dot}`} />
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${t.dot}`} />
        </span>
        {status === 'live' ? 'LIVE' : '待更新'}
      </span>
    </div>
  );
};
export default StatusBadge;
