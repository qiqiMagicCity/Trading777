'use client';

import { useState, useEffect } from 'react';
import SymbolLogo from '@/components/SymbolLogo';
import { findTrades, deleteTrade } from '@/lib/services/dataService';
import { computeFifo, type EnrichedTrade } from '@/lib/fifo';
import AddTradeModal from '@/components/AddTradeModal';
import { toNY } from '@/lib/timezone';
import { logger } from '@/lib/logger';

export default function TradesPage() {
  const [trades, setTrades] = useState<EnrichedTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [editingTrade, setEditingTrade] = useState<EnrichedTrade | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        const fetchedTrades = await findTrades();
        const invalidTrades = fetchedTrades.filter(t => !t.action);
        if (invalidTrades.length) {
          console.warn('Invalid trades encountered and skipped:', invalidTrades);
        }
        const validTrades = fetchedTrades.filter(t => !!t.action);
        if (validTrades.length === 0) {
          logger.info('No valid trades found in fetched data');
        }
        setTrades(computeFifo(validTrades));

        // 加载中文名称
        fetch('/data/symbol_name_map.json')
          .then((r) => r.json())
          .then((j) => setNameMap(j))
          .catch(err => console.error('加载符号名称失败', err));
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const reload = async () => {
    const fetched = await findTrades();
    const invalid = fetched.filter(t => !t.action);
    if (invalid.length) {
      console.warn('Invalid trades encountered and skipped:', invalid);
    }
    const valid = fetched.filter(t => !!t.action);
    if (valid.length === 0) {
      logger.info('No valid trades found when reloading');
    }
    setTrades(computeFifo(valid));
  };

  function handleTradeAdded() {
    setRefreshError(null);
    setIsRefreshing(true);
    const promise = reload();
    void promise.catch(err => {
      logger.error('[TradesPage] 后台刷新交易失败', err);
      setRefreshError(err instanceof Error ? err.message : '刷新交易失败');
    });
    void promise.finally(() => {
      setIsRefreshing(false);
    });
  }

  function formatNumber(value: number | undefined, decimals = 2) {
    if (value === undefined || value === null) return '-';
    return value.toFixed(decimals);
  }

  const weekdayMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (isLoading) {
    return <div className="text-center p-10">Loading trades...</div>;
  }

  if (trades.length === 0) {
    return <div className="text-center p-10">No trades available or import failed.</div>;
  }

  // helper for side class
  const getSideClass = (action: string) => {
    if (action === 'buy') return 'green';
    if (action === 'sell') return 'red';
    if (action === 'short') return 'purple';
    if (action === 'cover') return 'blue';
    return '';
  };

  let histReal = trades.reduce((s, t) => s + (t.realizedPnl || 0), 0);

  return (
    <div>
      <h2 className="section-title">全部交易记录</h2>
      {isRefreshing && (
        <div
          style={{
            background: 'rgba(59,130,246,0.15)',
            border: '1px solid rgba(59,130,246,0.4)',
            borderRadius: 8,
            color: '#bfdbfe',
            margin: '12px 0',
            padding: '8px 16px',
          }}
        >
          正在后台刷新交易列表...
        </div>
      )}
      {refreshError && (
        <div
          style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 8,
            color: '#fecaca',
            margin: '12px 0',
            padding: '8px 16px',
          }}
        >
          后台刷新失败：{refreshError}
        </div>
      )}
      <table id="all-trades" className="table">
        <thead>
          <tr>
            {[
              '#', 'logo', '代码', '中文', '日期', '星期', '统计', '方向', '单价', '数量', '订单金额', '盈亏平衡点', '盈亏', '详情', '目前持仓', '持仓成本', '编辑', '删除'
            ].map(h => <th key={h} className={h === '中文' ? 'cn' : ''}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {trades.map((trade, idx) => {
            const dateObj = toNY(trade.date);
            const weekday = weekdayMap[dateObj.getUTCDay()];
            const sideCls = getSideClass(trade.action || '');
            const amt = trade.price * trade.quantity;
            const pnlCls = (trade.realizedPnl || 0) > 0 ? 'green' : (trade.realizedPnl || 0) < 0 ? 'red' : 'white';

            return (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>
                  <SymbolLogo
                    className="logo"
                    symbol={trade.symbol}
                    alt={trade.symbol}
                    width={36}
                    height={36}
                  />
                </td>
                <td>{trade.symbol}</td>
                <td className="cn">{nameMap[trade.symbol] || '--'}</td>
                <td>{trade.date}</td>
                <td>{weekday}</td>
                <td>{trade.tradeCount}</td>
                <td className={sideCls}>{trade.action ? trade.action.toUpperCase() : 'UNKNOWN'}</td>
                <td>{formatNumber(trade.price)}</td>
                <td className={sideCls}>{trade.quantity}</td>
                <td>{formatNumber(amt)}</td>
                <td>{formatNumber(trade.breakEvenPrice)}</td>
                <td className={pnlCls}>{formatNumber(trade.realizedPnl)}</td>
                <td><a href={`/stock?symbol=${trade.symbol}`} className="details">详情</a></td>
                <td>{trade.quantityAfter}</td>
                <td>{formatNumber(trade.averageCost)}</td>
                <td>
                  <button className="btn-action btn-edit" data-tooltip="编辑" onClick={() => {
                    logger.debug('编辑交易:', trade);
                    setEditingTrade(trade);
                  }}>✏️</button>
                </td>
                <td>
                  <button className="btn-action btn-del" data-tooltip="删除" onClick={async () => {
                    if (confirm('确定删除该交易?')) {
                      if (trade.id != null) {
                        logger.debug('删除交易:', trade.id);
                        await deleteTrade(trade.id);
                        await reload();
                      }
                    }
                  }}>🗑️</button>
                </td>
              </tr>
            );
          })}
          {/* footer for hist realized */}
          <tr>
            <td colSpan={11}>所有历史平仓盈利</td>
            <td className={histReal > 0 ? 'green' : histReal < 0 ? 'red' : 'white'}>{formatNumber(histReal)}</td>
            <td colSpan={5}></td>
          </tr>
        </tbody>
      </table>
      {editingTrade && (
        <AddTradeModal
          trade={editingTrade}
          onClose={() => setEditingTrade(null)}
          onAdded={handleTradeAdded}
        />
      )}
    </div>
  );
}