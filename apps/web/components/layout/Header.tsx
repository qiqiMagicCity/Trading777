'use client';

import { useEffect, useState } from 'react';
import { format as formatTz, toZonedTime } from 'date-fns-tz';
import { nowNY } from '@/lib/timezone';
import { importData, exportData } from '@/lib/services/dataService';
import type { RawTrade, Trade, Position } from '@/lib/services/dataService';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

type DatasetImportPayload = {
  trades: Array<RawTrade | Trade>;
  positions: Array<Partial<Position> & Record<string, unknown>>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isDatasetPayloadCandidate(value: unknown): value is {
  trades: unknown[];
  positions: unknown[];
} {
  return (
    isRecord(value) &&
    Array.isArray(value.trades) &&
    Array.isArray(value.positions)
  );
}

// Match the original clocks div in the HTML
export function Clocks() {
  const [time, setTime] = useState(() => nowNY()); // Use a function to prevent immediate execution on server import
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const timer = setInterval(() => {
      setTime(nowNY());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!isClient) {
    return (
      <div id="clocks" className="clocks">
        <div>NY: --:--:--</div>
        <div>SH: --:--:--</div>
        <div>HK: --:--:--</div>
      </div>
    );
  }

  const nyTime = formatTz(toZonedTime(time, 'America/New_York'), 'HH:mm:ss');
  const shTime = formatTz(toZonedTime(time, 'Asia/Shanghai'), 'HH:mm:ss');
  const hkTime = formatTz(toZonedTime(time, 'Asia/Hong_Kong'), 'HH:mm:ss');

  return (
    <div id="clocks" className="clocks">
      <div>NY: {nyTime}</div>
      <div>SH: {shTime}</div>
      <div>HK: {hkTime}</div>
    </div>
  );
}

function getNyDate(): string {
  const now = nowNY();
  const nyDate = toZonedTime(now, 'America/New_York');
  return formatTz(nyDate, 'yyyy-MM-dd');
}

export function Header() {
  const [nyDate, setNyDate] = useState('');
  const pathname = usePathname();

  useEffect(() => {
    setNyDate(getNyDate());
  }, []);

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async (event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as unknown;
        if (!isDatasetPayloadCandidate(parsed)) {
          throw new Error('Invalid JSON format. "trades" and "positions" arrays are required.');
        }

        const payload: DatasetImportPayload = {
          trades: parsed.trades as DatasetImportPayload['trades'],
          positions: parsed.positions as DatasetImportPayload['positions'],
        };

        await importData(payload);
        alert('导入成功! 页面将刷新。');
        window.location.reload();
      } catch (err) {
        console.error(err);
        alert(`导入失败: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    });
    input.click();
  };

  const handleExport = async () => {
    try {
      const data = await exportData();
      const dataStr = JSON.stringify(data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'trades.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      alert('导出成功!');
    } catch (err) {
      console.error(err);
      alert(`导出失败: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return (
    <header className="top">
      <div>
        {pathname !== '/' && (
          <Link href="/" className="details" style={{ marginRight: '20px' }}>← 返回</Link>
        )}
        <Clocks />
      </div>
      <div className="right-btns">
        <span id="nyDate" className="date">{nyDate}</span>
        <button id="import" onClick={handleImport}>导入</button>
        <button id="export" onClick={handleExport}>导出</button>
        <button id="exportPrices">导出收盘价格</button>
        <button id="importPrices">导入收盘价格</button>
      </div>
    </header>
  );
} 