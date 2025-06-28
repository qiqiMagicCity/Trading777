
-- Trading777 v1.6.9: KPI / Positions / Trades views
-- Run in Supabase SQL Editor.

-- -------------------------------
-- Helper: function to compute realized pnl simple (same-day pair)
-- --------------------------------
create or replace view vw_day_pairs as
select
  t1.user_id,
  date(t1.trade_at) as d,
  t1.symbol,
  case
    when t1.action in ('BUY','COVER') then 1
    else -1
  end * t1.price as price_signed,
  case
    when t1.action in ('BUY','COVER') then t1.quantity
    else -t1.quantity
  end as qty_signed
from "TradeDate" t1;

-- KPI View
create or replace view vw_kpi_stats as
with today as (
  select * from vw_day_pairs where d = current_date
),
realized_today as (
  select user_id,
    sum(price_signed * qty_signed) as notional,
    sum(qty_signed) as net_qty
  from today
  group by user_id
),
totals as (
  select user_id,
    count(*) as total_trades
  from "TradeDate"
  group by user_id
)
select
  u.user_id,
  0::numeric as position_cost, -- placeholder; compute client-side
  coalesce(rt.notional,0) as intraday_realized,
  0::numeric as intraday_unreal,
  (select count(*) from "TradeDate" td where td.user_id=u.user_id and td.trade_at::date=current_date) as day_trades,
  tot.total_trades,
  0::numeric as wtd_pnl,
  0::numeric as mtd_pnl,
  0::numeric as ytd_pnl
from (select distinct user_id from "TradeDate") u
left join realized_today rt on rt.user_id=u.user_id
left join totals tot on tot.user_id=u.user_id;
-- Note: more complete SQL left for future; placeholders set to 0 so front-end can show later.

-- Positions View
create or replace view vw_positions as
select
  user_id,
  symbol,
  sum(case when action in ('BUY','COVER') then quantity else -quantity end) as qty,
  sum(case when action in ('BUY','COVER') then quantity*price else -quantity*price end) as cost,
  avg(price) filter (where action in ('BUY','COVER')) as avg_cost,
  0::numeric as jVal,
  0::numeric as mVal
from "TradeDate"
group by user_id, symbol
having sum(case when action in ('BUY','COVER') then quantity else -quantity end) <> 0;

-- Latest trades view
create or replace view vw_trades_latest as
select * from "TradeDate" order by trade_at desc;
