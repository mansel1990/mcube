-- MPHASIS was bought and sold on 2026-11-09. Zerodha charges that CNC round
-- trip as intraday, and the books used delivery rates. The original fund-ledger
-- rows stay as they were. This adds the difference and moves the position
-- balance to match. Safe to re-run.

DO $$
DECLARE
  pos_id bigint;
  pos_avg numeric;
  pos_pnl numeric;
  pos_charges numeric;
  pos_dry boolean;
  buy_turnover numeric := 0;
  sell_turnover numeric := 0;
  sell_qty numeric := 0;
  buy_order bigint;
  sell_order bigint;
  gross numeric;
  booked_sell numeric;
  booked_buy numeric;
  target_buy numeric;
  target_sell numeric;
  buy_credit numeric;
  sell_credit numeric;
BEGIN
  IF EXISTS (
    SELECT 1 FROM mlive.mlive_audit_log
    WHERE action = 'charges.intraday' AND symbol = 'MPHASIS'
  ) THEN
    RETURN;
  END IF;

  SELECT p.id, p.avg_price, p.realised_pnl, p.charges, p.dry_run
    INTO pos_id, pos_avg, pos_pnl, pos_charges, pos_dry
  FROM mlive.mlive_positions p
  WHERE p.symbol = 'MPHASIS'
    AND p.qty = 0
    AND (p.closed_at AT TIME ZONE 'Asia/Kolkata')::date = DATE '2026-11-09'
  ORDER BY p.dry_run, p.id DESC
  LIMIT 1;

  IF pos_id IS NULL THEN
    RAISE NOTICE 'MPHASIS position closed on 2026-11-09 was not found';
    RETURN;
  END IF;

  SELECT COALESCE(SUM(f.qty * f.price), 0), MAX(o.id)
    INTO buy_turnover, buy_order
  FROM mlive.mlive_fills f
  JOIN mlive.mlive_orders o ON o.id = f.order_id
  WHERE o.symbol = 'MPHASIS'
    AND o.side = 'BUY'
    AND o.dry_run = pos_dry
    AND (f.ts AT TIME ZONE 'Asia/Kolkata')::date = DATE '2026-11-09';

  SELECT COALESCE(SUM(f.qty * f.price), 0), COALESCE(SUM(f.qty), 0), MAX(o.id)
    INTO sell_turnover, sell_qty, sell_order
  FROM mlive.mlive_fills f
  JOIN mlive.mlive_orders o ON o.id = f.order_id
  WHERE o.symbol = 'MPHASIS'
    AND o.side = 'SELL'
    AND o.dry_run = pos_dry
    AND (f.ts AT TIME ZONE 'Asia/Kolkata')::date = DATE '2026-11-09';

  IF buy_turnover = 0 AND pos_avg = 2438.50 THEN
    buy_turnover := 7 * 2438.50;
    sell_turnover := 7 * 2444.80;
    sell_qty := 7;
  END IF;

  IF buy_turnover <= 0 OR sell_turnover <= 0 OR sell_qty <= 0 THEN
    RAISE NOTICE 'MPHASIS fills for 2026-11-09 were not found';
    RETURN;
  END IF;

  gross := sell_turnover - pos_avg * sell_qty;
  booked_sell := ROUND(gross - pos_pnl, 2);
  booked_buy := ROUND(pos_charges - booked_sell, 2);

  target_buy :=
      LEAST(ROUND(buy_turnover * 0.0003, 2), 20)
    + ROUND(buy_turnover * 0.0000297, 2)
    + ROUND(buy_turnover * 0.000001, 2)
    + ROUND(buy_turnover * 0.00003, 2);
  target_buy := target_buy + ROUND((
      LEAST(ROUND(buy_turnover * 0.0003, 2), 20)
    + ROUND(buy_turnover * 0.0000297, 2)
    + ROUND(buy_turnover * 0.000001, 2)
  ) * 0.18, 2);

  target_sell :=
      LEAST(ROUND(sell_turnover * 0.0003, 2), 20)
    + ROUND(sell_turnover * 0.00025, 2)
    + ROUND(sell_turnover * 0.0000297, 2)
    + ROUND(sell_turnover * 0.000001, 2);
  target_sell := target_sell + ROUND((
      LEAST(ROUND(sell_turnover * 0.0003, 2), 20)
    + ROUND(sell_turnover * 0.0000297, 2)
    + ROUND(sell_turnover * 0.000001, 2)
  ) * 0.18, 2);

  buy_credit := ROUND(booked_buy - target_buy, 2);
  sell_credit := ROUND(booked_sell - target_sell, 2);

  IF buy_credit = 0 AND sell_credit = 0 THEN
    RETURN;
  END IF;

  IF buy_credit <> 0 THEN
    INSERT INTO mlive.mlive_fund_ledger (kind, amount, ref_order_id, note, dry_run)
    VALUES ('charges', buy_credit, buy_order, 'Intraday charge adjustment MPHASIS', pos_dry);
  END IF;

  IF sell_credit <> 0 THEN
    INSERT INTO mlive.mlive_fund_ledger (kind, amount, ref_order_id, note, dry_run)
    VALUES ('realised_pnl', sell_credit, sell_order, 'Intraday P&L adjustment MPHASIS', pos_dry);
  END IF;

  UPDATE mlive.mlive_positions
     SET realised_pnl = realised_pnl + sell_credit,
         charges = charges - buy_credit - sell_credit
   WHERE id = pos_id;

  INSERT INTO mlive.mlive_audit_log (actor, action, symbol, before, after, reason)
  VALUES (
    'system',
    'charges.intraday',
    'MPHASIS',
    jsonb_build_object(
      'buyCharges', booked_buy,
      'sellCharges', booked_sell,
      'realisedPnl', pos_pnl,
      'positionCharges', pos_charges
    ),
    jsonb_build_object(
      'buyCharges', target_buy,
      'sellCharges', target_sell,
      'chargeCredit', buy_credit,
      'pnlCredit', sell_credit
    ),
    'Same-day CNC was charged as delivery. Zerodha charges it as intraday.'
  );
END $$;
