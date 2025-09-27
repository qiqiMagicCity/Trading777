'use client';

import { useState, useMemo, useCallback } from 'react';
import Image, { type ImageProps } from 'next/image';

type SymbolLogoProps = Omit<ImageProps, 'src' | 'alt'> & {
  symbol: string;
  alt?: string;
  /**
   * Optional override for the order of extensions to try before falling back to the default SVG.
   * Defaults to ["png", "svg"].
   */
  extensions?: Array<'png' | 'svg'>;
};

/**
 * SymbolLogo renders the brand logo for a symbol while gracefully falling back to a default image
 * if the dedicated logo asset is missing.
 */
export default function SymbolLogo({
  symbol,
  alt,
  extensions = ['png', 'svg'],
  ...imageProps
}: SymbolLogoProps) {
  const [fallbackIndex, setFallbackIndex] = useState(0);

  const sources = useMemo(() => {
    const normalizedSymbol = symbol.trim();
    const preferred = extensions
      .map((ext) => `/logos/${normalizedSymbol}.${ext}`);
    return [...preferred, '/logos/_default.svg'];
  }, [extensions, symbol]);

  const handleError = useCallback(() => {
    setFallbackIndex((prev) => (prev + 1 < sources.length ? prev + 1 : prev));
  }, [sources.length]);

  const resolvedSrc = sources[Math.min(fallbackIndex, sources.length - 1)];

  return (
    <Image
      {...imageProps}
      src={resolvedSrc}
      alt={alt ?? symbol}
      onError={handleError}
    />
  );
}
