-- Add jenis column to classify each detail_komponen item
ALTER TABLE public.detail_komponen
  ADD COLUMN IF NOT EXISTS jenis TEXT;

-- Backfill existing rows to a default category
UPDATE public.detail_komponen
SET jenis = COALESCE(jenis, 'B. Bahan');

-- Enforce valid categories and required value
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'detail_komponen_jenis_check'
      AND conrelid = 'public.detail_komponen'::regclass
  ) THEN
    ALTER TABLE public.detail_komponen
      ADD CONSTRAINT detail_komponen_jenis_check
      CHECK (jenis IN ('A. Tenaga kerja', 'B. Bahan', 'C. Peralatan'));
  END IF;
END $$;

ALTER TABLE public.detail_komponen
  ALTER COLUMN jenis SET NOT NULL;
