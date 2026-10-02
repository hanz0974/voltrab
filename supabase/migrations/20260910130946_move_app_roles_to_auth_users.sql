-- Keep a single user table: auth.users. Preserve unrelated app metadata.
LOCK TABLE auth.users, public.users IN SHARE ROW EXCLUSIVE MODE;
DROP TRIGGER IF EXISTS sync_auth_user_to_public_users ON auth.users;
DROP FUNCTION public.sync_auth_user_to_public_users();

UPDATE auth.users a
SET raw_app_meta_data = coalesce(a.raw_app_meta_data, '{}'::jsonb) ||
  jsonb_build_object('app_role', u.role, 'app_role_assigned_at', u.role_assigned_at,
                     'app_role_assigned_by', u.role_assigned_by)
FROM public.users u WHERE u.id = a.id;

CREATE OR REPLACE FUNCTION public.is_admin_actor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users
    WHERE id = (SELECT auth.uid()) AND raw_app_meta_data->>'app_role' = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.list_admin_users()
RETURNS TABLE(user_id uuid, email text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin_actor() THEN
    RAISE EXCEPTION 'Akses ditolak: hanya admin.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT u.id, u.email::text,
    coalesce((u.raw_app_meta_data->>'app_role_assigned_at')::timestamptz, u.created_at)
    FROM auth.users u WHERE u.raw_app_meta_data->>'app_role' = 'admin'
    ORDER BY 3;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_admin_user_by_email(p_email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE target_user_id uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(92746001);
  IF NOT public.is_admin_actor() THEN
    RAISE EXCEPTION 'Akses ditolak: hanya admin.' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO target_user_id FROM auth.users
    WHERE lower(email) = lower(btrim(p_email)) ORDER BY created_at LIMIT 1;
  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User belum terdaftar.' USING ERRCODE = 'P0002';
  END IF;
  UPDATE auth.users SET raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb) ||
    jsonb_build_object('app_role', 'admin', 'app_role_assigned_at', now(),
                      'app_role_assigned_by', (SELECT auth.uid()))
    WHERE id = target_user_id
      AND raw_app_meta_data->>'app_role' IS DISTINCT FROM 'admin';
  RETURN target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_admin_user(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(92746001);
  IF NOT public.is_admin_actor() THEN
    RAISE EXCEPTION 'Akses ditolak: hanya admin.' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Admin tidak dapat mencabut dirinya sendiri.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id
      AND raw_app_meta_data->>'app_role' = 'admin') THEN
    RAISE EXCEPTION 'Admin tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
  IF (SELECT count(*) FROM auth.users WHERE raw_app_meta_data->>'app_role' = 'admin') <= 1 THEN
    RAISE EXCEPTION 'Admin terakhir tidak dapat dihapus.' USING ERRCODE = '23514';
  END IF;
  UPDATE auth.users SET raw_app_meta_data =
    (coalesce(raw_app_meta_data, '{}'::jsonb) - 'app_role_assigned_at' - 'app_role_assigned_by')
      || jsonb_build_object('app_role', 'user')
    WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin_actor(), public.list_admin_users(),
  public.add_admin_user_by_email(text), public.remove_admin_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_actor(), public.list_admin_users(),
  public.add_admin_user_by_email(text), public.remove_admin_user(uuid) TO authenticated;
-- New accounts without app_role are ordinary users; only explicit admin grants qualify.
DROP TABLE public.users RESTRICT;
