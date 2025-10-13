'use client';
import React, {createContext, useContext, useId, useState, useEffect, useRef} from 'react';

type Ctx = {open:boolean; setOpen:(v:boolean)=>void; id:string};
const TooltipCtx = createContext<Ctx | null>(null);

export const TooltipProvider: React.FC<{children?:React.ReactNode}> = ({children}) => <>{children}</>;

export const Tooltip: React.FC<{children?:React.ReactNode}> = ({children}) => {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  return <TooltipCtx.Provider value={{open, setOpen, id}}>
    <div ref={ref} className="relative inline-flex">{children}</div>
  </TooltipCtx.Provider>;
};

type TooltipTriggerProps = {
  asChild?: boolean;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>;

export const TooltipTrigger = React.forwardRef<HTMLElement, TooltipTriggerProps>(
  ({asChild, children, className, ...rest}, forwardedRef) => {
    const ctx = useContext(TooltipCtx)!;
    const baseProps: React.HTMLAttributes<HTMLElement> & React.AriaAttributes = {
      onMouseEnter: () => ctx.setOpen(true),
      onMouseLeave: () => ctx.setOpen(false),
      onFocus:     () => ctx.setOpen(true),
      onBlur:      () => ctx.setOpen(false),
      'aria-describedby': ctx.id,
      'aria-expanded': ctx.open,
    };
    const mergedProps = { ...baseProps, ...rest };
    const assignRef = (node: HTMLElement | null) => {
      if (!forwardedRef) return;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else {
        forwardedRef.current = node;
      }
    };
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<
        React.HTMLAttributes<HTMLElement> & React.RefAttributes<HTMLElement>
      >;
      const mergedClassName = [child.props.className, className].filter(Boolean).join(' ') || undefined;
      return React.cloneElement(child, {
        ...mergedProps,
        className: mergedClassName,
        ref: assignRef,
      });
    }
    const buttonClassName = ['cursor-help', className].filter(Boolean).join(' ');
    return (
      <button
        type="button"
        ref={assignRef as React.Ref<HTMLButtonElement>}
        className={buttonClassName}
        {...mergedProps}
      >
        {children}
      </button>
    );
  }
);
TooltipTrigger.displayName = 'TooltipTrigger';

export const TooltipContent: React.FC<{children?:React.ReactNode; className?:string; side?:'top'|'bottom'|'left'|'right'; align?:'center'|'start'|'end'}> =
({children, className='', side='bottom'}) => {
  const ctx = useContext(TooltipCtx)!;
  const pos = side==='top' ? 'left-1/2 -translate-x-1/2 bottom-full mb-2'
    : side==='left' ? 'right-full mr-2 top-1/2 -translate-y-1/2'
    : side==='right'? 'left-full ml-2 top-1/2 -translate-y-1/2'
    : 'left-1/2 -translate-x-1/2 top-full mt-2';
  if (!ctx.open) return null;
  return <div id={ctx.id} role="tooltip"
    className={`z-50 absolute whitespace-pre rounded-md px-2 py-1 text-[10px] ring-1 ring-emerald-500/30
      bg-emerald-900/90 text-emerald-200 shadow-lg ${pos} ${className}`}>
    {children}
  </div>;
};
