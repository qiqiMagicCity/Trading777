'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { nowNY, ymdInNY } from '@/lib/timezone';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale/zh-CN';
import { importData, exportData, getAllPrices } from '@/lib/services/dataService';
import {
  importClosePrices,
  type ImportClosePricesResult,
} from '@/app/lib/prices/importClosePrices';
import type { RawTrade, Trade, Position } from '@/lib/services/dataService';

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

export function Header() {
  const router = useRouter();
  const [now, setNow] = useState(nowNY());
  const [nyTime, setNyTime] = useState('');
  const [valenciaTime, setValenciaTime] = useState('');
  const [shanghaiTime, setShanghaiTime] = useState('');

  useEffect(() => {
    // 更新所有时区的时间
    function updateAllTimes() {
      const currentDate = nowNY();

      // 获取各时区的时间
      setNyTime(currentDate.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }));

      setValenciaTime(currentDate.toLocaleTimeString('en-US', {
        timeZone: 'Europe/Madrid',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }));

      setShanghaiTime(currentDate.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }));

      setNow(currentDate);
    }

    // 初始化时间
    updateAllTimes();

    // 设置定时器每秒更新
    const timer = setInterval(() => {
      updateAllTimes();
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const datePart = format(now, 'yyyy/MM/dd', { locale: zhCN });
  const weekdayPart = format(now, 'EEE', { locale: zhCN }); // e.g. 周一
  const dateDisplay = `${datePart}${weekdayPart}`;

  // ---- Import / Export Handlers ----
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

  /* 导出数据 – 与旧版一致 {positions,trades,equityCurve,generated} */
  const handleExport = async () => {
    try {
      const core = await exportData(); // {positions,trades}
      const data = {
        ...core,
        equityCurve: [],        // 暂无专门存储，留空占位
        generated: nowNY().toISOString()
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
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

  const handleImportPrices = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async (event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const json = JSON.parse(text) as unknown;
        if (!json || typeof json !== 'object' || Array.isArray(json)) {
          throw new Error('文件需为对象格式，支持“代码→日期”或“日期→代码”的嵌套结构');
        }
        const result = await importClosePrices(
          json as Record<string, Record<string, number>>,
        );
        const message = buildImportMessage(result);
        if (result.writebackStatus === 'failed') {
          console.warn('[Header] close price writeback failed', result.error);
        }
        alert(message);
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("pricesImported"));
          }
        } catch (err) {
          console.error(err);
        }
        try {
          router.refresh();
          return;
        } catch (err) {
          console.error(err);
        }
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      } catch (err) {
        console.error(err);
        alert(`导入失败: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    });
    input.click();
  };

  /* 导出收盘价格 – 嵌套对象 {date:{symbol:close}} 与旧版一致 */
  const handleExportPrices = async () => {
    try {
      const prices = await getAllPrices(); // flat array
      // group by date -> symbol
      const nested: Record<string, Record<string, number>> = {};
      prices.forEach(p => {
        const bucket = nested[p.date] || (nested[p.date] = {});
        bucket[p.symbol] = p.close;
      });
      if (Object.keys(nested).length === 0) {
        alert('暂无价格数据可导出');
        return;
      }
      const blob = new Blob([JSON.stringify(nested, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `close_prices_${ymdInNY()}.json`;
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
    <header className="top" style={{ height: '45px', background: '#006344', color: '#ffffff' }}>
      <div id="clocks" className="clocks" style={{ display: 'flex', alignItems: 'center' }}>
        <span>纽约: {nyTime}</span>
        <span className="mx-2">|</span>
        <span>瓦伦西亚: {valenciaTime}</span>
        <span className="mx-2">|</span>
        <span>上海: {shanghaiTime}</span>
      </div>
      <div className="right-btns flex items-center" style={{ marginLeft: 'auto' }}>
        <span id="nyDate" className="date font-bold" style={{ marginRight: '12px' }}>{dateDisplay}</span>
        <button id="import" className="px-3 py-1 border-none" style={{ background: '#00e676', color: '#000000', borderRadius: '4px', marginLeft: '10px' }} onClick={handleImport}>导入</button>
        <button id="export" className="px-3 py-1 border-none" style={{ background: '#00e676', color: '#000000', borderRadius: '4px', marginLeft: '10px' }} onClick={handleExport}>导出</button>
        <button id="exportPrices" className="px-3 py-1 border-none" style={{ background: '#00e676', color: '#000000', borderRadius: '4px', marginLeft: '10px' }} onClick={handleExportPrices}>导出收盘价格</button>
        <button id="importPrices" className="px-3 py-1 border-none" style={{ background: '#00e676', color: '#000000', borderRadius: '4px', marginLeft: '10px' }} onClick={handleImportPrices}>导入收盘价格</button>
      </div>
    </header>
  );
}

function buildImportMessage(result: ImportClosePricesResult): string {
  const base = `成功导入 ${result.imported} 条收盘价。`;
  switch (result.writebackStatus) {
    case 'success':
      return `${base}（已通过 WRITEBACK_MODE=${result.writebackMode} 写回服务器）`;
    case 'unsupported':
      return `${base}（WRITEBACK_MODE=${result.writebackMode} 暂未自动写回，请手动处理。）`;
    case 'failed': {
      const reason = result.error ? `原因：${result.error}` : '原因未知';
      return `${base}（远端写回失败，已在本地生效。${reason}）`;
    }
    default:
      return `${base}（本地生效，WRITEBACK_MODE=${result.writebackMode}）`;
  }
}

// We need to add a "primary" variant to our button component
// I'll do that by modifying the button.tsx file next. 