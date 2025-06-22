// src/services/statistics.js

import { supabase } from '@/supabaseClient'

// 获取KPI数据
export async function getKpiData() {
  // TODO: 这里需要补充supabase聚合逻辑，现仅返回空数据占位
  // 实际部署后请按你的统计算法实现
  return {
    accountCost: null,
    summary: null,
    dailyPnL: null,
    tradeCount: null,
    totalTradeCount: null,
    mtd: null,
    ytd: null,
    intraday: null
  }
}

// 获取当前持仓
export async function getPositionList() {
  // TODO: 这里需要supabase查询你的trades表
  // 返回空数组占位，后续算法补充
  return []
}
