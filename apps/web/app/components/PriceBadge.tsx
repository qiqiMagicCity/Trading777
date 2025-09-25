'use client';

interface Props {
  price: number;
  stale?: boolean;
  pending?: boolean;
  requireConfirm?: boolean;
  onConfirm?: () => void;
  issueLevel?: 'warning' | 'error';
  issueMessage?: string;
}

export function PriceBadge({ price, stale, pending, requireConfirm, onConfirm, issueLevel, issueMessage }: Props) {
  const formatted = Number.isFinite(price) ? price.toFixed(2) : '--';
  const issueLabel = issueLevel === 'error' ? '缺失' : issueLevel === 'warning' ? '回退' : null;
  return (
    <span className="inline-flex items-center gap-1" title={issueMessage}>
      <span className={pending ? 'text-blue-500 font-semibold' : undefined}>{formatted}</span>
      {pending && (
        <span className="px-1 text-xs bg-blue-100 text-blue-600 rounded">排队中</span>
      )}
      {stale && (
        <span className="px-1 text-xs bg-yellow-200 text-yellow-800 rounded">STALE</span>
      )}
      {issueLabel && (
        <span
          className={`px-1 text-xs rounded ${
            issueLevel === 'error'
              ? 'bg-red-200 text-red-700'
              : 'bg-yellow-100 text-yellow-800'
          }`}
        >
          {issueLabel}
        </span>
      )}
      {requireConfirm && (
        <button
          onClick={onConfirm}
          className="ml-1 px-1 border border-red-500 text-red-500 text-xs rounded"
        >
          确认
        </button>
      )}
    </span>
  );
}

export default PriceBadge;

