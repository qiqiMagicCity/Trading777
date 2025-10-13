'use client';
import * as React from 'react';
export const TooltipProvider: React.FC<{children?: React.ReactNode}> = ({ children }) => <>{children}</>;
export const Tooltip: React.FC<{children?: React.ReactNode}> = ({ children }) => <span className="relative inline-flex items-center group">{children}</span>;
export const TooltipTrigger = React.forwardRef<HTMLElement, {asChild?: boolean; children?: React.ReactNode}>(
  ({ asChild, children, ...rest }, ref) => asChild && React.isValidElement(children)
    ? React.cloneElement(children as any, { ref, ...rest })
    : <button ref={ref as any} {...rest} className="cursor-help">{children}</button>
);
TooltipTrigger.displayName = 'TooltipTrigger';
export const TooltipContent: React.FC<{children?: React.ReactNode; className?: string; side?: 'top'|'bottom'|'left'|'right'; align?: 'center'|'start'|'end'}> = ({ children, className='', side='bottom' }) => {
  const pos = side==='top' ? 'left-1/2 -translate-x-1/2 bottom-full mb-2'
    : side==='left' ? 'right-full mr-2 top-1/2 -translate-y-1/2'
    : side==='right'? 'left-full ml-2 top-1/2 -translate-y-1/2'
    : 'left-1/2 -translate-x-1/2 top-full mt-2';
  return <div role="tooltip" className={`pointer-events-none absolute z-50 hidden whitespace-pre rounded-md px-2 py-1 text-[10px]
    ring-1 ring-emerald-500/30 bg-emerald-900/90 text-emerald-200 shadow-lg
    group-hover:block group-focus-within:block ${pos} ${className}`}>
    {children}
  </div>;
};
