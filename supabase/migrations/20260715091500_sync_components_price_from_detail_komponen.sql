-- Keep components.price synchronized with detail_komponen total per component
CREATE OR REPLACE FUNCTION public.refresh_component_price(p_component_id TEXT)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.components c
  SET price = COALESCE((
    SELECT ROUND(SUM(d.jumlah_harga))::BIGINT
    FROM public.detail_komponen d
    WHERE d.component_id = p_component_id
  ), 0)
  WHERE c.id = p_component_id;
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

-- Initial backfill for all existing components
UPDATE public.components c
SET price = COALESCE((
  SELECT ROUND(SUM(d.jumlah_harga))::BIGINT
  FROM public.detail_komponen d
  WHERE d.component_id = c.id
), 0);