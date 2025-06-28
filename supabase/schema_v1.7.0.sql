
-- Trading777 v1.7.0 schema
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='trade_action_enum') THEN
    CREATE TYPE trade_action_enum AS ENUM ('BUY','SELL','SHORT','COVER');
  END IF;
END$$;

-- ensure values uppercase then cast
UPDATE public."TradeDate" SET action = UPPER(action::text);

ALTER TABLE public."TradeDate"
  ALTER COLUMN action TYPE trade_action_enum USING action::trade_action_enum,
  ALTER COLUMN price TYPE numeric(18,4),
  ALTER COLUMN quantity TYPE numeric(18,6);

ALTER TABLE public."profiles"
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'TRADER';

CREATE TABLE IF NOT EXISTS public.opening_positions (
  user_id uuid REFERENCES auth.users(id),
  symbol  text NOT NULL,
  qty     numeric(18,6) NOT NULL,
  snap_date date NOT NULL,
  PRIMARY KEY (user_id, symbol, snap_date)
);

CREATE OR REPLACE FUNCTION public.take_opening_snapshot() RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.opening_positions (user_id, symbol, qty, snap_date)
  SELECT user_id,
         symbol,
         SUM(CASE WHEN action IN ('BUY','COVER') THEN quantity ELSE -quantity END),
         CURRENT_DATE
  FROM public."TradeDate"
  WHERE trade_at < CURRENT_DATE + INTERVAL '9 hours 30 minutes'
  GROUP BY user_id, symbol
  ON CONFLICT DO NOTHING;
END;
$$;

-- KPI view
CREATE OR REPLACE VIEW public.vw_kpi_stats AS
SELECT
  u.id AS user_id,
  COALESCE(SUM(ABS(pos.qty)*pos.avg_cost),0) AS position_amount,
  COALESCE(SUM(CASE WHEN date(t.trade_at)=CURRENT_DATE AND t.action IN ('SELL','COVER') THEN t.price*t.quantity END),0)
    -COALESCE(SUM(CASE WHEN date(t.trade_at)=CURRENT_DATE AND t.action IN ('BUY','SHORT') THEN t.price*t.quantity END),0) AS intraday_realized,
  0 AS intraday_unrealized_placeholder,
  COUNT(CASE WHEN date(t.trade_at)=CURRENT_DATE THEN 1 END) AS day_trades,
  COUNT(t.id) AS total_trades,
  SUM(CASE WHEN date_trunc('week', t.trade_at)=date_trunc('week',CURRENT_DATE)
    THEN CASE WHEN t.action IN ('SELL','COVER') THEN t.price*t.quantity ELSE -t.price*t.quantity END END) AS wtd_pnl,
  SUM(CASE WHEN date_trunc('month', t.trade_at)=date_trunc('month',CURRENT_DATE)
    THEN CASE WHEN t.action IN ('SELL','COVER') THEN t.price*t.quantity ELSE -t.price*t.quantity END END) AS mtd_pnl,
  SUM(CASE WHEN date_trunc('year', t.trade_at)=date_trunc('year',CURRENT_DATE)
    THEN CASE WHEN t.action IN ('SELL','COVER') THEN t.price*t.quantity ELSE -t.price*t.quantity END END) AS ytd_pnl
FROM auth.users u
LEFT JOIN public."TradeDate" t ON u.id=t.user_id
LEFT JOIN (
  SELECT user_id, symbol,
    SUM(CASE WHEN action IN ('BUY','COVER') THEN quantity ELSE -quantity END) AS qty,
    SUM(CASE WHEN action IN ('BUY','COVER') THEN price*quantity ELSE -price*quantity END)
/ NULLIF(SUM(CASE WHEN action IN ('BUY','COVER') THEN quantity ELSE -quantity END),0) AS avg_cost
  FROM public."TradeDate"
  GROUP BY user_id, symbol
) pos ON pos.user_id=u.id
GROUP BY u.id;

-- positions view
CREATE OR REPLACE VIEW public.vw_positions AS
SELECT user_id, symbol, SUM(qty) AS qty,
       SUM(qty*price)/NULLIF(SUM(qty),0) AS avg_cost,
       0 AS jVal, 0 AS day_change
FROM (
  SELECT user_id, symbol,
    CASE WHEN action IN ('BUY','COVER') THEN quantity ELSE -quantity END AS qty,
    price
  FROM public."TradeDate"
) x
GROUP BY user_id, symbol
HAVING SUM(qty)<>0;

CREATE OR REPLACE VIEW public.vw_trades_latest AS
SELECT * FROM public."TradeDate" ORDER BY trade_at DESC;
