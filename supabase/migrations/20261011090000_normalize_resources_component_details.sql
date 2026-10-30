-- =====================================================================
-- Normalisasi rincian AHSP sesuai ERD (Gambar 3.2):
--   components  1 ── M  component_details  M ── 1  resources
-- Tabel lama detail_komponen (sumber daya ditulis ulang di setiap baris)
-- digantikan oleh:
--   * resources          : sumber daya (tenaga kerja, bahan, peralatan) milik
--                          pengguna beserta harga satuannya, disimpan satu kali.
--   * component_details  : entitas asosiatif komponen–sumber daya dengan koefisien.
-- Identitas sumber daya = (pengguna, jenis, uraian, satuan, harga_satuan), sehingga
-- sumber daya bernama sama dengan harga berbeda pada AHSP sumber (mis. "Klem 20 mm"
-- Rp298 dan Rp900) tetap menjadi dua sumber daya dan harga komponen tidak berubah.
-- Baris kembar dalam satu komponen (sumber daya sama muncul dua kali) digabung
-- dengan menjumlahkan koefisiennya; jumlah harga komponen tetap sama.
-- =====================================================================

-- Penanda untuk menunda hitung ulang harga per baris saat operasi massal.
CREATE OR REPLACE FUNCTION public.price_refresh_skipped()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT COALESCE(current_setting('voltrab.skip_price_refresh', true), '') = 'on';
$$;

-- ---------------------------------------------------------------------
-- 1. Tabel resources
-- ---------------------------------------------------------------------
CREATE TABLE public.resources (
  resource_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  jenis         text NOT NULL CHECK (jenis IN ('A. Tenaga kerja', 'B. Bahan', 'C. Peralatan')),
  uraian        text NOT NULL,
  satuan        text NOT NULL,
  harga_satuan  bigint NOT NULL CHECK (harga_satuan >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resources_unique_per_user UNIQUE (user_id, jenis, uraian, satuan, harga_satuan)
);

COMMENT ON TABLE public.resources IS
  'Sumber daya AHSP (tenaga kerja, bahan, peralatan) milik pengguna; harga satuan disimpan satu kali.';

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY resources_select_own ON public.resources
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY resources_insert_own ON public.resources
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY resources_update_own ON public.resources
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY resources_delete_own ON public.resources
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_resources_updated_at
  BEFORE UPDATE ON public.resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- 2. Tabel component_details (entitas asosiatif M:N)
-- ---------------------------------------------------------------------
CREATE TABLE public.component_details (
  component_id  text NOT NULL,
  resource_id   uuid NOT NULL REFERENCES public.resources(resource_id) ON DELETE CASCADE,
  koefisien     numeric(12,4) NOT NULL CHECK (koefisien >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (component_id, resource_id)
);

COMMENT ON TABLE public.component_details IS
  'Entitas asosiatif components–resources (M:N) beserta koefisien pemakaian sumber daya.';

CREATE INDEX component_details_resource_id_idx ON public.component_details (resource_id);

ALTER TABLE public.component_details ENABLE ROW LEVEL SECURITY;

-- Kepemilikan baris mengikuti pemilik sumber daya.
CREATE POLICY component_details_select_own ON public.component_details
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.resources r WHERE r.resource_id = component_details.resource_id AND r.user_id = auth.uid()));
CREATE POLICY component_details_insert_own ON public.component_details
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.resources r WHERE r.resource_id = component_details.resource_id AND r.user_id = auth.uid()));
CREATE POLICY component_details_update_own ON public.component_details
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.resources r WHERE r.resource_id = component_details.resource_id AND r.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.resources r WHERE r.resource_id = component_details.resource_id AND r.user_id = auth.uid()));
CREATE POLICY component_details_delete_own ON public.component_details
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.resources r WHERE r.resource_id = component_details.resource_id AND r.user_id = auth.uid()));

CREATE TRIGGER trg_component_details_updated_at
  BEFORE UPDATE ON public.component_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Komponen harus ada pada katalog pemilik sumber daya (components ber-PK (user_id, id)).
CREATE OR REPLACE FUNCTION public.trg_component_details_check_component()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.resources r
    JOIN public.components c ON c.user_id = r.user_id AND c.id = NEW.component_id
    WHERE r.resource_id = NEW.resource_id
  ) THEN
    RAISE EXCEPTION 'Komponen % tidak ditemukan pada katalog pemilik sumber daya', NEW.component_id
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_component_details_check_component
  BEFORE INSERT OR UPDATE OF component_id, resource_id ON public.component_details
  FOR EACH ROW EXECUTE FUNCTION public.trg_component_details_check_component();

-- Menghapus komponen ikut menghapus rinciannya.
CREATE OR REPLACE FUNCTION public.trg_components_delete_details()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  DELETE FROM public.component_details cd
  USING public.resources r
  WHERE cd.resource_id = r.resource_id
    AND r.user_id = OLD.user_id
    AND cd.component_id = OLD.id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_components_delete_details
  AFTER DELETE ON public.components
  FOR EACH ROW EXECUTE FUNCTION public.trg_components_delete_details();

-- ---------------------------------------------------------------------
-- 3. View baca rincian AHSP (gabungan component_details + resources)
-- ---------------------------------------------------------------------
CREATE VIEW public.component_detail_view
WITH (security_invoker = true) AS
SELECT
  cd.resource_id AS id,          -- pengenal baris rincian di dalam satu komponen
  cd.component_id,
  cd.resource_id,
  r.user_id,
  r.jenis,
  r.uraian,
  r.satuan,
  cd.koefisien,
  r.harga_satuan,
  (cd.koefisien * r.harga_satuan::numeric)::numeric(20,4) AS jumlah_harga,
  cd.created_at,
  cd.updated_at
FROM public.component_details cd
JOIN public.resources r ON r.resource_id = cd.resource_id;

COMMENT ON VIEW public.component_detail_view IS
  'Rincian AHSP per komponen untuk dibaca aplikasi (component_details JOIN resources).';

GRANT SELECT ON public.component_detail_view TO authenticated;

-- ---------------------------------------------------------------------
-- 4. Hitung ulang harga komponen dari component_details × resources
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_component_price(p_user_id uuid, p_component_id text)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  d_total numeric := 0;
BEGIN
  SELECT COALESCE(SUM(cd.koefisien * r.harga_satuan), 0)
  INTO d_total
  FROM public.component_details cd
  JOIN public.resources r ON r.resource_id = cd.resource_id
  WHERE r.user_id = p_user_id
    AND cd.component_id = p_component_id;

  UPDATE public.components c
  SET price = ROUND(d_total * (1 + public.get_biaya_umum_keuntungan_koef()))::bigint
  WHERE c.user_id = p_user_id
    AND c.id = p_component_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_all_component_prices()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  UPDATE public.components c
  SET price = ROUND(t.d_total * (1 + public.get_biaya_umum_keuntungan_koef()))::bigint
  FROM (
    SELECT r.user_id, cd.component_id, SUM(cd.koefisien * r.harga_satuan) AS d_total
    FROM public.component_details cd
    JOIN public.resources r ON r.resource_id = cd.resource_id
    GROUP BY r.user_id, cd.component_id
  ) t
  WHERE c.user_id = t.user_id
    AND c.id = t.component_id;
END;
$$;

-- Hitung ulang sekaligus untuk sekumpulan komponen milik satu pengguna.
CREATE OR REPLACE FUNCTION public.refresh_component_prices(p_user_id uuid, p_component_ids text[])
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  UPDATE public.components c
  SET price = ROUND(COALESCE(t.d_total, 0) * (1 + public.get_biaya_umum_keuntungan_koef()))::bigint
  FROM (
    SELECT ids.component_id, SUM(cd.koefisien * r.harga_satuan) AS d_total
    FROM unnest(p_component_ids) AS ids(component_id)
    LEFT JOIN public.component_details cd ON cd.component_id = ids.component_id
    LEFT JOIN public.resources r ON r.resource_id = cd.resource_id AND r.user_id = p_user_id
    GROUP BY ids.component_id
  ) t
  WHERE c.user_id = p_user_id
    AND c.id = t.component_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_component_price_from_component_details()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_user uuid;
BEGIN
  IF public.price_refresh_skipped() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT user_id INTO v_user FROM public.resources WHERE resource_id = OLD.resource_id;
    IF v_user IS NOT NULL THEN
      PERFORM public.refresh_component_price(v_user, OLD.component_id);
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT user_id INTO v_user FROM public.resources WHERE resource_id = NEW.resource_id;
    IF v_user IS NOT NULL THEN
      PERFORM public.refresh_component_price(v_user, NEW.component_id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_component_details_sync_component_price
  AFTER INSERT OR UPDATE OR DELETE ON public.component_details
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_component_price_from_component_details();

-- Perubahan harga satu sumber daya memperbarui harga semua komponen yang memakainya.
CREATE OR REPLACE FUNCTION public.trg_sync_component_price_from_resources()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF public.price_refresh_skipped() THEN
    RETURN NEW;
  END IF;

  PERFORM public.refresh_component_prices(
    NEW.user_id,
    ARRAY(SELECT DISTINCT cd.component_id FROM public.component_details cd WHERE cd.resource_id = NEW.resource_id)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_resources_sync_component_price
  AFTER UPDATE OF harga_satuan ON public.resources
  FOR EACH ROW
  WHEN (OLD.harga_satuan IS DISTINCT FROM NEW.harga_satuan)
  EXECUTE FUNCTION public.trg_sync_component_price_from_resources();

-- ---------------------------------------------------------------------
-- 5. RPC aplikasi
-- ---------------------------------------------------------------------

-- Simpan satu baris rincian AHSP pada sebuah komponen.
--  * p_old_resource_id NULL  : tambah baris baru (sumber daya dicari/dibuat; bila sumber daya
--                              yang sama sudah ada pada komponen, koefisien dijumlahkan).
--  * hanya harga yang berubah: harga sumber daya diperbarui sekali dan berlaku untuk semua
--                              komponen yang memakainya (kecuali sudah ada sumber daya
--                              identik dengan harga baru; baris dipindah ke sumber daya itu).
--  * uraian/satuan/jenis berubah: baris dipindah ke sumber daya yang sesuai.
CREATE OR REPLACE FUNCTION public.save_component_detail(
  p_component_id text,
  p_old_resource_id uuid,
  p_jenis text,
  p_uraian text,
  p_satuan text,
  p_koefisien numeric,
  p_harga_satuan numeric
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old public.resources%ROWTYPE;
  v_rid uuid;
  v_harga bigint := ROUND(GREATEST(COALESCE(p_harga_satuan, 0), 0))::bigint;
  v_koef numeric := GREATEST(COALESCE(p_koefisien, 0), 0);
  v_same_row boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesi pengguna tidak valid' USING ERRCODE = '28000';
  END IF;

  IF p_old_resource_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.resources WHERE resource_id = p_old_resource_id AND user_id = v_uid;
  END IF;

  IF v_old.resource_id IS NOT NULL
     AND v_old.jenis = p_jenis AND v_old.uraian = p_uraian AND v_old.satuan = p_satuan
     AND (v_old.harga_satuan = v_harga OR NOT EXISTS (
           SELECT 1 FROM public.resources
           WHERE user_id = v_uid AND jenis = p_jenis AND uraian = p_uraian
             AND satuan = p_satuan AND harga_satuan = v_harga)) THEN
    IF v_old.harga_satuan <> v_harga THEN
      UPDATE public.resources SET harga_satuan = v_harga WHERE resource_id = v_old.resource_id;
    END IF;
    v_rid := v_old.resource_id;
  ELSE
    INSERT INTO public.resources (user_id, jenis, uraian, satuan, harga_satuan)
    VALUES (v_uid, p_jenis, p_uraian, p_satuan, v_harga)
    ON CONFLICT (user_id, jenis, uraian, satuan, harga_satuan) DO NOTHING
    RETURNING resource_id INTO v_rid;

    IF v_rid IS NULL THEN
      SELECT resource_id INTO v_rid FROM public.resources
      WHERE user_id = v_uid AND jenis = p_jenis AND uraian = p_uraian
        AND satuan = p_satuan AND harga_satuan = v_harga;
    END IF;
  END IF;

  v_same_row := v_old.resource_id IS NOT NULL AND v_old.resource_id = v_rid;

  IF v_old.resource_id IS NOT NULL AND v_old.resource_id <> v_rid THEN
    DELETE FROM public.component_details
    WHERE component_id = p_component_id AND resource_id = v_old.resource_id;
  END IF;

  IF v_same_row THEN
    UPDATE public.component_details SET koefisien = v_koef
    WHERE component_id = p_component_id AND resource_id = v_rid;
  ELSE
    INSERT INTO public.component_details (component_id, resource_id, koefisien)
    VALUES (p_component_id, v_rid, v_koef)
    ON CONFLICT (component_id, resource_id)
    DO UPDATE SET koefisien = public.component_details.koefisien + EXCLUDED.koefisien;
  END IF;

  -- Sumber daya lama yang tidak dipakai komponen mana pun dihapus.
  IF v_old.resource_id IS NOT NULL AND v_old.resource_id <> v_rid THEN
    DELETE FROM public.resources r
    WHERE r.resource_id = v_old.resource_id
      AND NOT EXISTS (SELECT 1 FROM public.component_details cd WHERE cd.resource_id = r.resource_id);
  END IF;

  RETURN v_rid;
END;
$$;

-- Hapus satu baris rincian; sumber daya yang tidak lagi dipakai ikut dihapus.
CREATE OR REPLACE FUNCTION public.delete_component_detail(p_component_id text, p_resource_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesi pengguna tidak valid' USING ERRCODE = '28000';
  END IF;

  DELETE FROM public.component_details
  WHERE component_id = p_component_id AND resource_id = p_resource_id;

  DELETE FROM public.resources r
  WHERE r.resource_id = p_resource_id
    AND r.user_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.component_details cd WHERE cd.resource_id = r.resource_id);
END;
$$;

-- Ganti seluruh rincian sekumpulan komponen (impor Excel AHSP).
-- p_rows: [{component_id, jenis, uraian, satuan, koefisien, harga_satuan}, ...]
CREATE OR REPLACE FUNCTION public.replace_component_details(p_component_ids text[], p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesi pengguna tidak valid' USING ERRCODE = '28000';
  END IF;

  PERFORM set_config('voltrab.skip_price_refresh', 'on', true);

  DELETE FROM public.component_details cd
  USING public.resources r
  WHERE cd.resource_id = r.resource_id
    AND r.user_id = v_uid
    AND cd.component_id = ANY (p_component_ids);

  WITH import_rows AS (
    SELECT x.component_id, x.jenis, trim(x.uraian) AS uraian, trim(x.satuan) AS satuan,
           ROUND(GREATEST(COALESCE(x.harga_satuan, 0), 0))::bigint AS harga_satuan
    FROM jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb))
         AS x(component_id text, jenis text, uraian text, satuan text, koefisien numeric, harga_satuan numeric)
    WHERE x.component_id = ANY (p_component_ids)
  )
  INSERT INTO public.resources (user_id, jenis, uraian, satuan, harga_satuan)
  SELECT DISTINCT v_uid, i.jenis, i.uraian, i.satuan, i.harga_satuan
  FROM import_rows i
  ON CONFLICT (user_id, jenis, uraian, satuan, harga_satuan) DO NOTHING;

  WITH import_rows AS (
    SELECT x.component_id, x.jenis, trim(x.uraian) AS uraian, trim(x.satuan) AS satuan,
           GREATEST(COALESCE(x.koefisien, 0), 0) AS koefisien,
           ROUND(GREATEST(COALESCE(x.harga_satuan, 0), 0))::bigint AS harga_satuan
    FROM jsonb_to_recordset(COALESCE(p_rows, '[]'::jsonb))
         AS x(component_id text, jenis text, uraian text, satuan text, koefisien numeric, harga_satuan numeric)
    WHERE x.component_id = ANY (p_component_ids)
  )
  INSERT INTO public.component_details (component_id, resource_id, koefisien)
  SELECT i.component_id, r.resource_id, SUM(i.koefisien)
  FROM import_rows i
  JOIN public.resources r
    ON r.user_id = v_uid AND r.jenis = i.jenis AND r.uraian = i.uraian
   AND r.satuan = i.satuan AND r.harga_satuan = i.harga_satuan
  GROUP BY i.component_id, r.resource_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM public.resources r
  WHERE r.user_id = v_uid
    AND NOT EXISTS (SELECT 1 FROM public.component_details cd WHERE cd.resource_id = r.resource_id);

  PERFORM public.refresh_component_prices(v_uid, p_component_ids);
  PERFORM set_config('voltrab.skip_price_refresh', 'off', true);

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.save_component_detail(text, uuid, text, text, text, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_component_detail(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.replace_component_details(text[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_component_detail(text, uuid, text, text, text, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_component_detail(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_component_details(text[], jsonb) TO authenticated;

-- ---------------------------------------------------------------------
-- 6. Katalog bawaan untuk pengguna baru
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_component_catalog(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  PERFORM set_config('voltrab.skip_price_refresh', 'on', true);

  INSERT INTO public.components (user_id, id, name, category, unit, price, is_active)
  SELECT p_user_id, id, name, category, unit, price, is_active
  FROM public.component_catalog_defaults
  ON CONFLICT (user_id, id) DO NOTHING;

  INSERT INTO public.resources (user_id, jenis, uraian, satuan, harga_satuan)
  SELECT DISTINCT p_user_id, d.jenis, d.uraian, d.satuan, d.harga_satuan
  FROM public.component_detail_defaults d
  ON CONFLICT (user_id, jenis, uraian, satuan, harga_satuan) DO NOTHING;

  INSERT INTO public.component_details (component_id, resource_id, koefisien)
  SELECT d.component_id, r.resource_id, SUM(d.koefisien)
  FROM public.component_detail_defaults d
  JOIN public.resources r
    ON r.user_id = p_user_id AND r.jenis = d.jenis AND r.uraian = d.uraian
   AND r.satuan = d.satuan AND r.harga_satuan = d.harga_satuan
  GROUP BY d.component_id, r.resource_id
  ON CONFLICT (component_id, resource_id) DO NOTHING;

  PERFORM public.refresh_component_prices(
    p_user_id,
    ARRAY(SELECT DISTINCT component_id FROM public.component_detail_defaults)
  );
  PERFORM set_config('voltrab.skip_price_refresh', 'off', true);
END;
$$;

-- ---------------------------------------------------------------------
-- 7. Pindahkan data lama lalu hapus detail_komponen
-- ---------------------------------------------------------------------
SELECT set_config('voltrab.skip_price_refresh', 'on', false);

INSERT INTO public.resources (user_id, jenis, uraian, satuan, harga_satuan, created_at)
SELECT user_id, jenis, uraian, satuan, harga_satuan, MIN(created_at)
FROM public.detail_komponen
GROUP BY user_id, jenis, uraian, satuan, harga_satuan;

INSERT INTO public.component_details (component_id, resource_id, koefisien, created_at)
SELECT d.component_id, r.resource_id, SUM(d.koefisien), MIN(d.created_at)
FROM public.detail_komponen d
JOIN public.resources r
  ON r.user_id = d.user_id AND r.jenis = d.jenis AND r.uraian = d.uraian
 AND r.satuan = d.satuan AND r.harga_satuan = d.harga_satuan
GROUP BY d.component_id, r.resource_id;

-- Pastikan total rincian setiap komponen tidak berubah sebelum tabel lama dihapus.
DO $$
DECLARE
  v_diff integer;
BEGIN
  SELECT COUNT(*) INTO v_diff
  FROM (
    SELECT user_id, component_id, SUM(jumlah_harga) AS total
    FROM public.detail_komponen GROUP BY 1, 2
  ) old_t
  FULL JOIN (
    SELECT r.user_id, cd.component_id, SUM(cd.koefisien * r.harga_satuan) AS total
    FROM public.component_details cd JOIN public.resources r ON r.resource_id = cd.resource_id
    GROUP BY 1, 2
  ) new_t USING (user_id, component_id)
  WHERE old_t.total IS DISTINCT FROM new_t.total;

  IF v_diff > 0 THEN
    RAISE EXCEPTION 'Migrasi dibatalkan: % komponen memiliki total rincian berbeda', v_diff;
  END IF;
END;
$$;

SELECT set_config('voltrab.skip_price_refresh', 'off', false);

DROP TABLE public.detail_komponen;
DROP FUNCTION IF EXISTS public.trg_sync_component_price_from_detail();
