'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Script from 'next/script';
import { findTrades, findMetricsDaily } from '@/lib/services/dataService';
import type { DailyResult } from '@/lib/types';
import { computeFifo, EnrichedTrade } from '@/lib/fifo';
import { TradeCalendar } from '@/modules/TradeCalendar';
import { RankingTable } from '@/modules/RankingTable';
import { toNY } from '@/lib/timezone';

declare const Chart: any;

export default function AnalysisPage() {
  const [isChartReady, setIsChartReady] = useState(false);
  // 使用 react-query 实时加载交易数据，自动刷新
  const { data: trades = [] } = useQuery<EnrichedTrade[]>({
    queryKey: ['trades'],
    queryFn: async () => {
      const raw = await findTrades();
      return computeFifo(raw);
    },
    refetchInterval: 5000
  });
  const { data: metricsDaily = [] } = useQuery<DailyResult[]>({
    queryKey: ['metricsDaily'],
    queryFn: findMetricsDaily,
    refetchInterval: 60000
  });
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const pnlCanvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);

  // 当 Chart.js 和 metricsDaily 都准备好时绘制/更新图表
  useEffect(() => {
    if (!isChartReady || !pnlCanvasRef.current) return;

    // 根据 period 聚合每日盈亏
    const map: Record<string, number> = {};
    const fmt = (d: string) => {
      if (period === 'day') return d;
      if (period === 'week') {
        const dt = toNY(d);
        const y = dt.getFullYear();
        const week = Math.ceil((((+dt) - +toNY(y, 0, 1)) / 86400000 + toNY(y, 0, 1).getDay() + 1) / 7);
        return `${y}-W${String(week).padStart(2, '0')}`;
      }
      // month
      return d.slice(0, 7);
    };
    metricsDaily.forEach(r => {
      const key = fmt(r.date);
      const pnl = r.realized + r.unrealized;
      map[key] = (map[key] || 0) + pnl;
    });
    const dates = Object.keys(map).sort();
    let cumulative = 0;
    const lineValues: number[] = [];
    dates.forEach(d => {
      cumulative += map[d] ?? 0;
      lineValues.push(Number(cumulative.toFixed(2)));
    });

    const ctx = pnlCanvasRef.current!.getContext('2d');
    if (!ctx) return;

    if (chartRef.current) {
      chartRef.current.data.labels = dates;
      chartRef.current.data.datasets[0].data = lineValues;
      chartRef.current.update();
    } else {
      chartRef.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels: dates,
          datasets: [{
            label: '累计盈亏',
            data: lineValues,
            borderColor: '#00e676',
            tension: 0.1
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { labels: { color: '#fff' } }
          },
          scales: {
            x: { ticks: { color: '#fff' }, grid: { color: 'rgba(255,255,255,0.1)' } },
            y: { ticks: { color: '#fff' }, grid: { color: 'rgba(255,255,255,0.1)' } }
          }
        }
      });
    }
  }, [isChartReady, metricsDaily, period]);

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"
        onLoad={() => setIsChartReady(true)}
      />

      <h2 className="page-title section-title" style={{ textAlign: 'center', margin: '20px 0 10px', fontSize: '1.6rem' }}>
        📊 交易分析
      </h2>

      <main style={{ width: '90%', maxWidth: 'var(--page-max)', margin: '20px auto' }}>
        {/* 曲线图 */}
        <section>
          <h3 className="section-title">资金收益曲线</h3>
          <div className="btn-group" style={{ marginBottom: '10px' }}>
            <button className="btn" onClick={() => setPeriod('day')} disabled={period === 'day'}>日</button>
            <button className="btn" onClick={() => setPeriod('week')} disabled={period === 'week'}>周</button>
            <button className="btn" onClick={() => setPeriod('month')} disabled={period === 'month'}>月</button>
          </div>
          <canvas id="pnlCanvas" ref={pnlCanvasRef} height="220"></canvas>
        </section>

        {/* 交易日历 */}
        <TradeCalendar trades={trades} title="交易日历（总账户）" id="tradeCalendarTotal" />
        {/* 日内交易日历占位，简单复用同组件，未来可根据 intraday 判断筛选 */}
        <TradeCalendar trades={trades} title="交易日历（日内交易）" id="tradeCalendarIntraday" isIntraday />

        {/* 盈亏排行榜 */}
        <RankingTable trades={trades} />


      </main>
    </>
  );
} 