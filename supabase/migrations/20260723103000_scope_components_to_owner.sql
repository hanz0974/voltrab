-- Scope components and detail_komponen to each authenticated user.
--
-- The original catalog rows have no owner. Keep them as immutable seed data,
-- clone them for every existing auth user, and provision the same catalog for
-- every user created after this migration.

CREATE TABLE IF NOT EXISTS public.component_catalog_defaults (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL,
  price BIGINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO public.component_catalog_defaults (id, name, category, unit, price, is_active)
SELECT id, name, category, unit, price, COALESCE(is_active, TRUE)
FROM public.components
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  unit = EXCLUDED.unit,
  price = EXCLUDED.price,
  is_active = EXCLUDED.is_active;

CREATE TABLE IF NOT EXISTS public.component_detail_defaults (
  component_id TEXT NOT NULL REFERENCES public.component_catalog_defaults(id) ON DELETE CASCADE,
  uraian TEXT NOT NULL,
  satuan TEXT NOT NULL,
  koefisien NUMERIC(12,4) NOT NULL CHECK (koefisien >= 0),
  harga_satuan BIGINT NOT NULL CHECK (harga_satuan >= 0),
  jenis TEXT NOT NULL CHECK (jenis IN ('A. Tenaga kerja', 'B. Bahan', 'C. Peralatan')),
  PRIMARY KEY (component_id, uraian, satuan, jenis)
);

INSERT INTO public.component_detail_defaults (
  component_id, uraian, satuan, koefisien, harga_satuan, jenis
)
SELECT component_id, uraian, satuan, koefisien, harga_satuan, jenis
FROM public.detail_komponen
ON CONFLICT (component_id, uraian, satuan, jenis) DO UPDATE SET
  koefisien = EXCLUDED.koefisien,
  harga_satuan = EXCLUDED.harga_satuan;

-- Seed tables are server-side provisioning data, not part of the public API.
ALTER TABLE public.component_catalog_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.component_detail_defaults ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.component_catalog_defaults FROM anon, authenticated;
REVOKE ALL ON TABLE public.component_detail_defaults FROM anon, authenticated;

ALTER TABLE public.components
  ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE public.detail_komponen
  DROP CONSTRAINT IF EXISTS detail_komponen_component_id_fkey;

-- Remove the ownerless catalog only after it has been copied to the seed
-- tables. It will be recreated once for each auth user below.
DELETE FROM public.detail_komponen;
DELETE FROM public.components WHERE user_id IS NULL;

ALTER TABLE public.components
  ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.components
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.components
  DROP CONSTRAINT IF EXISTS components_pkey;

ALTER TABLE public.components
  ADD CONSTRAINT components_pkey PRIMARY KEY (user_id, id);

ALTER TABLE public.components
  DROP CONSTRAINT IF EXISTS components_user_id_fkey;

ALTER TABLE public.components
  ADD CONSTRAINT components_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_components_user_id ON public.components(user_id);
CREATE INDEX IF NOT EXISTS idx_components_user_id_active ON public.components(user_id, is_active);

ALTER TABLE public.detail_komponen
  ADD COLUMN IF NOT EXISTS user_id UUID;

ALTER TABLE public.detail_komponen
  ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.detail_komponen
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.detail_komponen
  ADD CONSTRAINT detail_komponen_component_id_fkey
  FOREIGN KEY (user_id, component_id) REFERENCES public.components(user_id, id) ON DELETE CASCADE;

ALTER TABLE public.detail_komponen
  DROP CONSTRAINT IF EXISTS detail_komponen_user_id_fkey;

ALTER TABLE public.detail_komponen
  ADD CONSTRAINT detail_komponen_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_detail_komponen_user_id ON public.detail_komponen(user_id);
CREATE INDEX IF NOT EXISTS idx_detail_komponen_user_component ON public.detail_komponen(user_id, component_id);

CREATE OR REPLACE FUNCTION public.provision_component_catalog(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.components (
    user_id, id, name, category, unit, price, is_active
  )
  SELECT
    p_user_id, id, name, category, unit, price, is_active
  FROM public.component_catalog_defaults
  ON CONFLICT (user_id, id) DO NOTHING;

  INSERT INTO public.detail_komponen (
    id, user_id, component_id, uraian, satuan, koefisien, harga_satuan, jenis
  )
  SELECT
    gen_random_uuid(), p_user_id, component_id, uraian, satuan,
    koefisien, harga_satuan, jenis
  FROM public.component_detail_defaults d
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.detail_komponen existing
    WHERE existing.user_id = p_user_id
      AND existing.component_id = d.component_id
      AND existing.uraian = d.uraian
      AND existing.satuan = d.satuan
      AND existing.jenis = d.jenis
  );
END;
$$;

REVOKE ALL ON FUNCTION public.provision_component_catalog(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.handle_new_user_component_catalog()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.provision_component_catalog(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user_component_catalog() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_auth_user_created_provision_component_catalog ON auth.users;
CREATE TRIGGER on_auth_user_created_provision_component_catalog
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_component_catalog();

-- Provision every user that existed before this migration.
DO $$
DECLARE
  existing_user record;
BEGIN
  FOR existing_user IN SELECT id FROM auth.users LOOP
    PERFORM public.provision_component_catalog(existing_user.id);
  END LOOP;
END;
$$;

-- Components ownership RLS.
DROP POLICY IF EXISTS "components_select" ON public.components;
DROP POLICY IF EXISTS "components_insert" ON public.components;
DROP POLICY IF EXISTS "components_update" ON public.components;
DROP POLICY IF EXISTS "components_delete" ON public.components;

CREATE POLICY "components_select_own"
ON public.components
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "components_insert_own"
ON public.components
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "components_update_own"
ON public.components
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "components_delete_own"
ON public.components
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Detail ownership RLS.
DROP POLICY IF EXISTS "detail_komponen_select" ON public.detail_komponen;
DROP POLICY IF EXISTS "detail_komponen_insert" ON public.detail_komponen;
DROP POLICY IF EXISTS "detail_komponen_update" ON public.detail_komponen;
DROP POLICY IF EXISTS "detail_komponen_delete" ON public.detail_komponen;

CREATE POLICY "detail_komponen_select_own"
ON public.detail_komponen
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "detail_komponen_insert_own"
ON public.detail_komponen
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "detail_komponen_update_own"
ON public.detail_komponen
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "detail_komponen_delete_own"
ON public.detail_komponen
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.refresh_component_price(p_user_id uuid, p_component_id text)
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
  WHERE d.user_id = p_user_id
    AND d.component_id = p_component_id;

  e_koef := public.get_biaya_umum_keuntungan_koef();

  UPDATE public.components c
  SET price = ROUND(d_total * (1 + e_koef))::bigint
  WHERE c.user_id = p_user_id
    AND c.id = p_component_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_component_price(p_component_id text)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.refresh_component_price(auth.uid(), p_component_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_all_component_prices()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.components c
  SET price = (
    SELECT ROUND(SUM(d.jumlah_harga) * (1 + public.get_biaya_umum_keuntungan_koef()))::bigint
    FROM public.detail_komponen d
    WHERE d.user_id = c.user_id
      AND d.component_id = c.id
  )
  WHERE EXISTS (
    SELECT 1
    FROM public.detail_komponen d
    WHERE d.user_id = c.user_id
      AND d.component_id = c.id
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
    PERFORM public.refresh_component_price(NEW.user_id, NEW.component_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.component_id IS DISTINCT FROM OLD.component_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      PERFORM public.refresh_component_price(OLD.user_id, OLD.component_id);
    END IF;
    PERFORM public.refresh_component_price(NEW.user_id, NEW.component_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_component_price(OLD.user_id, OLD.component_id);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

-- Backfill prices after ownership migration.
SELECT public.refresh_all_component_prices();
