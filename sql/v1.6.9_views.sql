-- vw_kpi_stats
create or replace view vw_kpi_stats as
with trades as (
  select *,
    case
      when action in ('BUY','COVER') then quantity
      else -quantity
    end as signed_qty,
    case
      when action in ('BUY','COVER') then price
      else -price
    end as signed_price
  from "TradeDate"
)
, base as (
  select
    user_id,
    sum(abs(signed_qty)*price) filter (where now()::date = trade_at::date) as today_value,
    sum(case when action in ('BUY','COVER') then quantity*price else 0 end) as buy_value,
    sum(case when action in ('SELL','SHORT') then quantity*price else 0 end) as sell_value
  from trades
  group by user_id
)
select
  user_id,
  (select sum(abs(quantity)*price) from trades t2 where t2.user_id = base.user_id and 
       (t2.action in ('BUY','COVER') and not exists (select 1))) as position_cost,
  0::numeric as intraday_realized, -- placeholder
  0::numeric as intraday_unreal,
  (select count(*) from trades t3 where t3.user_id=base.user_id and trade_at::date = current_date) as day_trades,
  (select count(*) from trades t3 where t3.user_id=base.user_id) as total_trades,
  0::numeric as wtd_pnl,
  0::numeric as mtd_pnl,
  0::numeric as ytd_pnl
from base;

-- vw_positions
create or replace view vw_positions as
select
  user_id,
  symbol,
  sum(case when action in ('BUY','COVER') then quantity else -quantity end)::numeric as qty,
  sum(case when action in ('BUY','COVER') then quantity*price else -quantity*price end)::numeric /
    nullif(sum(case when action in ('BUY','COVER') then quantity else -quantity end),0) as avg_cost
from "TradeDate"
group by user_id, symbol
having sum(case when action in ('BUY','COVER') then quantity else -quantity end) <> 0;

-- vw_trades_latest
create or replace view vw_trades_latest as
select * from "TradeDate";
