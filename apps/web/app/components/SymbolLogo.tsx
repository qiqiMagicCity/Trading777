'use client';

import Image from 'next/image';
import { useEffect, useState, memo } from 'react';

type SymbolLogoProps = {
  symbol: string;
  alt?: string;
  className?: string;
  width?: number;
  height?: number;
  ext?: 'png' | 'svg';
  id?: string;                            // NEW
  style?: React.CSSProperties;            // NEW
};

const DEFAULT_FALLBACK = '/logos/_default.svg';

function buildPrimarySrc(symbol: string, ext: 'png' | 'svg') {
  const safe = (symbol || '').trim().toUpperCase();
  return `/logos/${safe}.${ext}`;
}

function SymbolLogo({
  symbol,
  alt,
  className,
  width = 24,
  height = 24,
  ext = 'png',
  id,                                     // NEW
  style,                                  // NEW
}: SymbolLogoProps) {
  const [src, setSrc] = useState<string>(buildPrimarySrc(symbol, ext));

  useEffect(() => {
    setSrc(buildPrimarySrc(symbol, ext));
  }, [symbol, ext]);

  const handleError: React.ReactEventHandler<HTMLImageElement> = () => {
    if (src !== DEFAULT_FALLBACK) setSrc(DEFAULT_FALLBACK);
  };

  return (
    <Image
      id={id}                             // pass-through
      src={src}
      alt={alt ?? symbol}
      width={width}
      height={height}
      className={className}
      style={style}                       // pass-through
      onError={handleError}
    />
  );
}

export default memo(SymbolLogo);

