'use client';

import Image from 'next/image';
import { useEffect, useState, memo } from 'react';

type SymbolLogoProps = {
  symbol: string;
  alt?: string;
  className?: string;
  width?: number;
  height?: number;
  // 允许自定义扩展名；默认 .png（项目里现有图标是 png）
  ext?: 'png' | 'svg';
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
}: SymbolLogoProps) {
  // 永远是 string，不给 undefined 机会
  const [src, setSrc] = useState<string>(buildPrimarySrc(symbol, ext));

  // 当 symbol/ext 变化时，重置为主地址
  useEffect(() => {
    setSrc(buildPrimarySrc(symbol, ext));
  }, [symbol, ext]);

  // onError 明确类型签名；只回退一次，避免死循环
  const handleError: React.ReactEventHandler<HTMLImageElement> = () => {
    if (src !== DEFAULT_FALLBACK) {
      setSrc(DEFAULT_FALLBACK);
    }
  };

  return (
    <Image
      src={src}                    // <-- 类型稳定为 string
      alt={alt ?? symbol}          // <-- 正确的空值合并
      width={width}
      height={height}
      className={className}
      onError={handleError}
      // 注：public/ 下的本地资源无需额外 domain 配置
      // priority 可按页面需要再加
    />
  );
}

export default memo(SymbolLogo);
