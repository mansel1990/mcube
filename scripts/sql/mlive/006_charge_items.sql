-- Charge breakdown per fill. Rows are append-only: a correction is a new
-- `adjustment` row, which may be negative. Run this by hand. It is not applied
-- by a deploy.
--
-- The estimate matches lib/mlive/charges.ts (delivery by default, intraday when
-- a sell is on the position's buy date). For each position that has no items
-- yet, the engine model (including the same-day buy adjustment) is kept when
-- it sums to the booked charges. Otherwise the delivery model is kept when
-- that sums instead, which is the pre-adjustment MPHASIS book. Anything else
-- raises.

CREATE TABLE IF NOT EXISTS mlive.mlive_charge_items (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  position_id  bigint NOT NULL REFERENCES mlive.mlive_positions (id),
  order_id     bigint REFERENCES mlive.mlive_orders (id),
  side         text NOT NULL CHECK (side IN ('BUY', 'SELL')),
  intraday     boolean NOT NULL,
  source       text NOT NULL CHECK (source IN ('kite', 'formula', 'adjustment')),
  brokerage    numeric(12,2) NOT NULL,
  stt          numeric(12,2) NOT NULL,
  exchange     numeric(12,2) NOT NULL,
  sebi         numeric(12,2) NOT NULL,
  stamp        numeric(12,2) NOT NULL,
  gst          numeric(12,2) NOT NULL,
  dp           numeric(12,2) NOT NULL,
  total        numeric(12,2) NOT NULL,
  ts           timestamptz NOT NULL DEFAULT now(),
  dry_run      boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS mlive_charge_items_position_idx ON mlive.mlive_charge_items (position_id);

CREATE OR REPLACE FUNCTION mlive.reject_charge_item_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'mlive_charge_items is append-only';
END;
$$;

DROP TRIGGER IF EXISTS mlive_charge_items_no_update ON mlive.mlive_charge_items;
CREATE TRIGGER mlive_charge_items_no_update
  BEFORE UPDATE OR DELETE ON mlive.mlive_charge_items
  FOR EACH ROW EXECUTE FUNCTION mlive.reject_charge_item_mutation();

REVOKE UPDATE, DELETE ON mlive.mlive_charge_items FROM PUBLIC;

CREATE OR REPLACE FUNCTION mlive.estimate_charge(p_side text, p_turnover numeric, p_intraday boolean)
RETURNS TABLE (
  brokerage numeric, stt numeric, exchange numeric, sebi numeric,
  stamp numeric, gst numeric, dp numeric, total numeric
)
LANGUAGE plpgsql AS $$
DECLARE
  v_brokerage numeric;
  v_stt numeric;
  v_exchange numeric;
  v_sebi numeric;
  v_stamp numeric;
  v_gst numeric;
  v_dp numeric;
  v_total numeric;
BEGIN
  v_exchange := ROUND(p_turnover * 0.0000297, 2);
  v_sebi := ROUND(p_turnover * 0.000001, 2);
  IF p_intraday THEN
    v_brokerage := LEAST(ROUND(p_turnover * 0.0003, 2), 20);
    v_stt := CASE WHEN p_side = 'SELL' THEN ROUND(p_turnover * 0.00025, 2) ELSE 0 END;
    v_stamp := CASE WHEN p_side = 'BUY' THEN ROUND(p_turnover * 0.00003, 2) ELSE 0 END;
    v_dp := 0;
  ELSE
    v_brokerage := 0;
    v_stt := ROUND(p_turnover * 0.001, 2);
    v_stamp := CASE WHEN p_side = 'BUY' THEN ROUND(p_turnover * 0.00015, 2) ELSE 0 END;
    v_dp := CASE WHEN p_side = 'SELL' THEN 15.93 ELSE 0 END;
  END IF;
  v_gst := ROUND((v_brokerage + v_exchange + v_sebi) * 0.18, 2);
  v_total := ROUND(v_brokerage + v_stt + v_exchange + v_sebi + v_stamp + v_gst + v_dp, 2);
  RETURN QUERY SELECT v_brokerage, v_stt, v_exchange, v_sebi, v_stamp, v_gst, v_dp, v_total;
END;
$$;

DO $$
DECLARE
  pos record;
  fill record;
  delivery_est record;
  engine_est record;
  intra_buy record;
  delivery_buy record;
  sold_qty numeric;
  delivery_sum numeric;
  engine_sum numeric;
  use_model text;
  same_day boolean;
  is_intra boolean;
BEGIN
  DROP TABLE IF EXISTS _mlive_charge_try;
  CREATE TEMP TABLE _mlive_charge_try (
    model text NOT NULL,
    order_id bigint,
    side text NOT NULL,
    intraday boolean NOT NULL,
    source text NOT NULL,
    brokerage numeric(12,2) NOT NULL,
    stt numeric(12,2) NOT NULL,
    exchange numeric(12,2) NOT NULL,
    sebi numeric(12,2) NOT NULL,
    stamp numeric(12,2) NOT NULL,
    gst numeric(12,2) NOT NULL,
    dp numeric(12,2) NOT NULL,
    total numeric(12,2) NOT NULL
  ) ON COMMIT DROP;

  FOR pos IN
    SELECT * FROM mlive.mlive_positions p
    WHERE NOT EXISTS (
      SELECT 1 FROM mlive.mlive_charge_items i WHERE i.position_id = p.id
    )
  LOOP
    DELETE FROM _mlive_charge_try;
    sold_qty := 0;

    FOR fill IN
      SELECT f.qty, f.price, f.ts, o.id AS order_id, o.side
        FROM mlive.mlive_fills f
        JOIN mlive.mlive_orders o ON o.id = f.order_id
       WHERE o.symbol = pos.symbol
         AND o.dry_run = pos.dry_run
         AND f.ts >= pos.opened_at - interval '60 seconds'
         AND f.ts <= COALESCE(pos.closed_at, now()) + interval '60 seconds'
       ORDER BY f.ts, f.id
    LOOP
      same_day := (fill.ts AT TIME ZONE 'Asia/Kolkata')::date
        = (pos.opened_at AT TIME ZONE 'Asia/Kolkata')::date;
      SELECT * INTO delivery_est FROM mlive.estimate_charge(fill.side, fill.qty * fill.price, false);
      INSERT INTO _mlive_charge_try
      VALUES ('delivery', fill.order_id, fill.side, false, 'formula',
        delivery_est.brokerage, delivery_est.stt, delivery_est.exchange, delivery_est.sebi,
        delivery_est.stamp, delivery_est.gst, delivery_est.dp, delivery_est.total);

      is_intra := fill.side = 'SELL' AND same_day;
      SELECT * INTO engine_est FROM mlive.estimate_charge(fill.side, fill.qty * fill.price, is_intra);
      INSERT INTO _mlive_charge_try
      VALUES ('engine', fill.order_id, fill.side, is_intra, 'formula',
        engine_est.brokerage, engine_est.stt, engine_est.exchange, engine_est.sebi,
        engine_est.stamp, engine_est.gst, engine_est.dp, engine_est.total);

      IF fill.side = 'SELL' THEN
        sold_qty := sold_qty + fill.qty;
      END IF;
    END LOOP;

    IF sold_qty > 0 AND EXISTS (SELECT 1 FROM _mlive_charge_try WHERE model = 'engine' AND intraday) THEN
      SELECT * INTO intra_buy FROM mlive.estimate_charge('BUY', pos.avg_price * sold_qty, true);
      SELECT * INTO delivery_buy FROM mlive.estimate_charge('BUY', pos.avg_price * sold_qty, false);
      INSERT INTO _mlive_charge_try
      VALUES (
        'engine', NULL, 'BUY', true, 'adjustment',
        ROUND(intra_buy.brokerage - delivery_buy.brokerage, 2),
        ROUND(intra_buy.stt - delivery_buy.stt, 2),
        ROUND(intra_buy.exchange - delivery_buy.exchange, 2),
        ROUND(intra_buy.sebi - delivery_buy.sebi, 2),
        ROUND(intra_buy.stamp - delivery_buy.stamp, 2),
        ROUND(intra_buy.gst - delivery_buy.gst, 2),
        ROUND(intra_buy.dp - delivery_buy.dp, 2),
        ROUND(intra_buy.total - delivery_buy.total, 2)
      );
    END IF;

    SELECT COALESCE(SUM(total), 0) INTO engine_sum FROM _mlive_charge_try WHERE model = 'engine';
    SELECT COALESCE(SUM(total), 0) INTO delivery_sum FROM _mlive_charge_try WHERE model = 'delivery';

    IF abs(engine_sum - pos.charges) <= 0.01 THEN
      use_model := 'engine';
    ELSIF abs(delivery_sum - pos.charges) <= 0.01 THEN
      use_model := 'delivery';
    ELSE
      RAISE EXCEPTION 'charge items for % (position %) sum to engine % / delivery % but booked charges are %',
        pos.symbol, pos.id, engine_sum, delivery_sum, pos.charges;
    END IF;

    INSERT INTO mlive.mlive_charge_items
      (position_id, order_id, side, intraday, source, brokerage, stt, exchange, sebi, stamp, gst, dp, total, dry_run)
    SELECT pos.id, order_id, side, intraday, source, brokerage, stt, exchange, sebi, stamp, gst, dp, total, pos.dry_run
      FROM _mlive_charge_try
     WHERE model = use_model;
  END LOOP;

  IF EXISTS (
    SELECT 1
      FROM mlive.mlive_positions p
     WHERE abs(COALESCE(p.charges, 0) - COALESCE((
       SELECT SUM(i.total) FROM mlive.mlive_charge_items i WHERE i.position_id = p.id
     ), 0)) > 0.01
  ) THEN
    RAISE EXCEPTION 'a position''s charge items do not sum to its booked charges';
  END IF;
END;
$$;
