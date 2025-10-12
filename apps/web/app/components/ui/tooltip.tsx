'use client';
import * as React from 'react';

type FC<P = { children?: React.ReactNode }> = React.FC<P>;

export const TooltipProvider: FC = ({ children }) => <>{children}</>;

type TooltipProps = { children?: React.ReactNode; delayDuration?: number };
export const Tooltip: React.FC<TooltipProps> = ({ children }) => (
  <span className="relative inline-flex items-center group">{children}</span>
);

// 与 shadcn 写法兼容：<TooltipTrigger asChild>...</TooltipTrigger>
type TriggerProps = React.HTMLAttributes<HTMLElement> & { asChild?: boolean };
export const TooltipTrigger = React.forwardRef<HTMLElement, TriggerProps>(
  ({ asChild, children, className = '', ...rest }, ref) => {
    if (asChild && React.isValidElement(children)) {
      // 透传 ref/props 给子元素
      // @ts-expect-error forward ref to child element when using asChild
      return React.cloneElement(children, { ref, ...rest });
    }
    return (
      // 退化为按钮，键盘可聚焦
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        {...rest}
        className={[className, 'cursor-help'].filter(Boolean).join(' ')}
      >
        {children}
      </button>
    );
  }
);
TooltipTrigger.displayName = 'TooltipTrigger';

type ContentProps = React.HTMLAttributes<HTMLDivElement> & {
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'center' | 'start' | 'end';
};
export const TooltipContent: FC<ContentProps> = ({
  children,
  className = '',
  side = 'bottom',
}) => {
  const pos =
    side === 'top'
      ? 'left-1/2 -translate-x-1/2 bottom-full mb-2'
      : side === 'left'
      ? 'right-full mr-2 top-1/2 -translate-y-1/2'
      : side === 'right'
      ? 'left-full ml-2 top-1/2 -translate-y-1/2'
      : // default bottom
        'left-1/2 -translate-x-1/2 top-full mt-2';

  return (
    <div
      role="tooltip"
      className={`pointer-events-none absolute z-50 hidden whitespace-pre rounded-md px-2 py-1 text-[10px]
      ring-1 ring-emerald-500/30 bg-emerald-900/90 text-emerald-200 shadow-lg
      group-hover:block group-focus-within:block ${pos} ${className}`}
    >
      {children}
    </div>
  );
};
