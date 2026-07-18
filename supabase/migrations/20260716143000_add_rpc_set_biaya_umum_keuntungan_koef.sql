/*
# Add RPC setter for biaya umum koefisien

Avoids direct REST PATCH/UPSERT against app_settings from frontend and centralizes
authorization + normalization in SQL.
*/

CREATE OR REPLACE FUNCTION public.set_biaya_umum_keuntungan_koef(p_value numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_value numeric;
BEGIN
  IF NOT public.is_admin_actor() THEN
    RAISE EXCEPTION 'Akses ditolak: hanya admin yang bisa mengubah koefisien.'
      USING ERRCODE = '42501';
  END IF;

  normalized_value := GREATEST(0.10, LEAST(0.15, COALESCE(p_value, 0.10)));

  INSERT INTO public.app_settings (key, value_numeric, description)
  VALUES (
    'biaya_umum_keuntungan_koef',
    normalized_value,
    'Koefisien E. Biaya Umum dan Keuntungan'
  )
  ON CONFLICT (key)
  DO UPDATE SET value_numeric = EXCLUDED.value_numeric;

  RETURN normalized_value;
END;
$$;

REVOKE ALL ON FUNCTION public.set_biaya_umum_keuntungan_koef(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_biaya_umum_keuntungan_koef(numeric) TO authenticated;
