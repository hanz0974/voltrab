/*
# Sync components.price with total detail including E (Biaya Umum dan Keuntungan)

Formula:
- D = SUM(detail_komponen.jumlah_harga)
- E = D * biaya_umum_keuntungan_koef (from app_settings, default 0.10)
- F = D + E

Set components.price = ROUND(F)
*/

CREATE OR REPLACE FUNCTION public.get_biaya_umum_keuntungan_koef()
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN value_numeric < 0.10 THEN 0.10
        WHEN value_numeric > 0.15 THEN 0.15
        ELSE value_numeric
      END
      FROM public.app_settings
      WHERE key = 'biaya_umum_keuntungan_koef'
      LIMIT 1
    ),
    0.10
  );
$$;

CREATE OR REPLACE FUNCTION public.refresh_component_price(p_component_id text)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  d_total numeric := 0;
  e_koef numeric := 0.10;
BEGIN
  SELECT COALESCE(SUM(d.jumlah_harga), 0)
  INTO d_total
  FROM public.detail_komponen d
  WHERE d.component_id = p_component_id;

  e_koef := public.get_biaya_umum_keuntungan_koef();

  UPDATE public.components c
  SET price = ROUND(d_total * (1 + e_koef))::bigint
  WHERE c.id = p_component_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_all_component_prices()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.components c
  SET price = COALESCE(
    (
      SELECT ROUND(COALESCE(SUM(d.jumlah_harga), 0) * (1 + public.get_biaya_umum_keuntungan_koef()))::bigint
      FROM public.detail_komponen d
      WHERE d.component_id = c.id
    ),
    0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_component_price_from_detail()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.refresh_component_price(NEW.component_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.component_id IS DISTINCT FROM OLD.component_id THEN
      PERFORM public.refresh_component_price(OLD.component_id);
    END IF;
    PERFORM public.refresh_component_price(NEW.component_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_component_price(OLD.component_id);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_detail_komponen_sync_component_price ON public.detail_komponen;
CREATE TRIGGER trg_detail_komponen_sync_component_price
  AFTER INSERT OR UPDATE OR DELETE ON public.detail_komponen
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_component_price_from_detail();

CREATE OR REPLACE FUNCTION public.trg_sync_component_price_from_settings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.key = 'biaya_umum_keuntungan_koef' THEN
    PERFORM public.refresh_all_component_prices();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_settings_sync_component_price ON public.app_settings;
CREATE TRIGGER trg_app_settings_sync_component_price
  AFTER INSERT OR UPDATE OF value_numeric ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_component_price_from_settings();

-- Initial backfill with current coefficient
SELECT public.refresh_all_component_prices();
