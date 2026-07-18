-- Ensure koefisien uses decimal precision for detail_komponen.
-- If type conversion is needed, generated column jumlah_harga must be recreated.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'detail_komponen'
  ) THEN
    RAISE NOTICE 'Table public.detail_komponen does not exist. Skipping.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'detail_komponen'
      AND column_name = 'koefisien'
      AND data_type = 'numeric'
      AND numeric_precision = 12
      AND numeric_scale = 4
  ) THEN
    RAISE NOTICE 'Column koefisien already NUMERIC(12,4). Skipping.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'detail_komponen'
      AND column_name = 'jumlah_harga'
      AND is_generated = 'ALWAYS'
  ) THEN
    ALTER TABLE public.detail_komponen DROP COLUMN jumlah_harga;
  END IF;

  ALTER TABLE public.detail_komponen
    ALTER COLUMN koefisien TYPE NUMERIC(12,4)
    USING koefisien::NUMERIC;

  ALTER TABLE public.detail_komponen
    ADD COLUMN jumlah_harga NUMERIC(20,4) GENERATED ALWAYS AS (koefisien * harga_satuan::NUMERIC) STORED;
END $$;
