-- Create detail_komponen table related to components
CREATE TABLE IF NOT EXISTS public.detail_komponen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id TEXT NOT NULL REFERENCES public.components(id) ON DELETE CASCADE,
  uraian TEXT NOT NULL,
  satuan TEXT NOT NULL,
  koefisien NUMERIC(12,4) NOT NULL CHECK (koefisien >= 0),
  harga_satuan BIGINT NOT NULL CHECK (harga_satuan >= 0),
  jumlah_harga NUMERIC(20,4) GENERATED ALWAYS AS (koefisien * harga_satuan::NUMERIC) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_detail_komponen_component_id
  ON public.detail_komponen(component_id);

ALTER TABLE public.detail_komponen ENABLE ROW LEVEL SECURITY;

-- Follow components access pattern: authenticated users can read, admin users can modify.
DROP POLICY IF EXISTS "detail_komponen_select" ON public.detail_komponen;
CREATE POLICY "detail_komponen_select" ON public.detail_komponen FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "detail_komponen_insert" ON public.detail_komponen;
CREATE POLICY "detail_komponen_insert" ON public.detail_komponen FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = TRUE)
  );

DROP POLICY IF EXISTS "detail_komponen_update" ON public.detail_komponen;
CREATE POLICY "detail_komponen_update" ON public.detail_komponen FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = TRUE)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = TRUE)
  );

DROP POLICY IF EXISTS "detail_komponen_delete" ON public.detail_komponen;
CREATE POLICY "detail_komponen_delete" ON public.detail_komponen FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = TRUE)
  );

DROP TRIGGER IF EXISTS trg_detail_komponen_updated_at ON public.detail_komponen;
CREATE TRIGGER trg_detail_komponen_updated_at
  BEFORE UPDATE ON public.detail_komponen
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();