"use client";

import clsx from "clsx";
import { forwardRef, type HTMLAttributes } from "react";

type WarnChipProps = HTMLAttributes<HTMLSpanElement>;

const WarnChip = forwardRef<HTMLSpanElement, WarnChipProps>(({ className, children, ...rest }, ref) => {
  return (
    <span
      ref={ref}
      className={clsx(
        "pointer-events-auto z-20 inline-flex items-center gap-1 rounded-md bg-emerald-950/70 backdrop-blur-sm px-1.5 py-0.5 ring-1 ring-emerald-800/50 text-[10px] text-emerald-200",
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
});

WarnChip.displayName = "WarnChip";

export default WarnChip;
