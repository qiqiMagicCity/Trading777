
import { supabase } from '@/utils/supabaseClient'
import { fetchPrice } from '@/services/finnhubService'

function startOfWeek(d){
  const date = new Date(d)
  const day = date.getDay() || 7
  if(day!==1) date.setDate(date.getDate() - (day-1))
  date.setHours(0,0,0,0)
  return date
}
function startOfMonth(d){
  const date = new Date(d)
  date.setDate(1);date.setHours(0,0,0,0)
  return date
}
function startOfYear(d){
  const date = new Date(d)
  date.setMonth(0);date.setDate(1);date.setHours(0,0,0,0)
  return date
}
function toDateString(d){
  return d.toISOString().slice(0,10)
}

/**
 * Core KPI calculation for 功能区1.
 * @param {string} userId 
 * @returns {Promise<Object>} KPI object
 */
export async function getKpis(userId){
  if(!userId) return {}
  const today = new Date()
  const todayStr = toDateString(today)
  const { data: trades, error } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', userId)

  if(error) { console.error(error); return {} }
  if(!trades || !trades.length) return {}

  const positions = {}
  const todayTrades=[]
  const weekTrades=[]
  const monthTrades=[]
  const yearTrades=[]
  const sow = startOfWeek(today)
  const som = startOfMonth(today)
  const soy = startOfYear(today)

  trades.forEach(t=>{
    const tradeDate = new Date(t.trade_at)
    const dateStr = toDateString(tradeDate)
    if(dateStr===todayStr) todayTrades.push(t)
    if(tradeDate >= sow) weekTrades.push(t)
    if(tradeDate >= som) monthTrades.push(t)
    if(tradeDate >= soy) yearTrades.push(t)

    const symbol = t.symbol
    if(!positions[symbol]) positions[symbol]={qty:0,cost:0}
    const qty = t.quantity
    switch(t.trade_type){
      case 'BUY':
      case 'COVER':
        positions[symbol].qty += qty
        positions[symbol].cost += qty * t.price
        break
      case 'SELL':
      case 'SHORT':
        positions[symbol].qty -= qty
        positions[symbol].cost -= qty * t.price
        break
    }
  })

  let accountPositionCost = 0
  Object.values(positions).forEach(p=>{
    if(p.qty!==0){
      const avgCost = p.cost / p.qty
      accountPositionCost += avgCost * p.qty
    }
  })

  function calcRealized(list){
    const bySymbol = {}
    list.forEach(t=>{
      const sy = t.symbol
      if(!bySymbol[sy]) bySymbol[sy]={buy:[],sell:[]}
      if(['BUY','COVER'].includes(t.trade_type)) bySymbol[sy].buy.push(t)
      else if(['SELL','SHORT'].includes(t.trade_type)) bySymbol[sy].sell.push(t)
    })
    let pnl=0
    Object.values(bySymbol).forEach(group=>{
      const buyQty = group.buy.reduce((s,t)=>s+t.quantity,0)
      const sellQty = group.sell.reduce((s,t)=>s+t.quantity,0)
      const matched = Math.min(buyQty, sellQty)
      if(matched>0){
        const avgBuy = buyQty? group.buy.reduce((s,t)=>s+t.price*t.quantity,0)/buyQty : 0
        const avgSell = sellQty? group.sell.reduce((s,t)=>s+t.price*t.quantity,0)/sellQty : 0
        pnl += (avgSell - avgBuy) * matched
      }
    })
    return pnl
  }

  const dailyRealized = calcRealized(todayTrades)
  const wtdRealized = calcRealized(weekTrades)
  const mtdRealized = calcRealized(monthTrades)
  const ytdRealized = calcRealized(yearTrades)

  const dailyPnLTradeCount = todayTrades.length ? calcRealized(todayTrades)!==0 ? todayTrades.length : 0 : 0
  const dailyTradeCount = todayTrades.length
  const cumulativeTradeCount = trades.length

  // Unrealized PnL relative to yesterday close
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate()-1)
  const yesterdayStr = toDateString(yesterday)
  let dailyUnrealized = 0
  for(const [symbol,pos] of Object.entries(positions)){
    if(pos.qty===0) continue
    const { data: closeRow } = await supabase
      .from('daily_closing_prices')
      .select('closing_price')
      .eq('symbol', symbol)
      .eq('date', yesterdayStr)
      .single()
    const closing = closeRow? closeRow.closing_price : null
    let currentPrice = null
    try{
      const rt = await fetchPrice(symbol)
      currentPrice = rt.price
    }catch(e){ console.warn('price fetch', e)}
    if(closing!==null && currentPrice!==null && !isNaN(currentPrice)){
      dailyUnrealized += (currentPrice - closing) * pos.qty
    }
  }

  return {
    positionCost: accountPositionCost,
    dailyPnL: dailyRealized,
    dailyUnrealized,
    dailyPnLCount: dailyPnLTradeCount,
    dailyTradeCount,
    cumulativeTradeCount,
    wtdPnL: wtdRealized,
    mtdPnL: mtdRealized,
    ytdPnL: ytdRealized
  }
}
