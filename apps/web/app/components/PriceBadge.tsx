'use client';

interface Props {
  price: number;
  stale?: boolean;
  requireConfirm?: boolean;
  onConfirm?: () => void;
}

export function PriceBadge({ price, stale, requireConfirm, onConfirm }: Props) {
  const formatted = Number.isFinite(price) ? price.toFixed(2) : '--';
  return (
    <span className="inline-flex items-center gap-1">
      <span>{formatted}</span>
      {stale && (
        <span className="px-1 text-xs bg-yellow-200 text-yellow-800 rounded">STALE</span>
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

