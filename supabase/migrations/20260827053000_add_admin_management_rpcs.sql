-- Admin-only RPCs for managing application administrators without exposing
-- auth.users or the private admin_users table through the Data API.

CREATE OR REPLACE FUNCTION public.list_admin_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF NOT public.is_admin_actor() THEN
    RAISE EXCEPTION 'Akses ditolak: hanya admin yang dapat melihat daftar admin.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT au.user_id, u.email::text, au.created_at
  FROM public.admin_users au
  JOIN auth.users u ON u.id = au.user_id
  ORDER BY au.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_admin_user_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  IF NOT public.is_admin_actor() THEN
    RAISE EXCEPTION 'Akses ditolak: hanya admin yang dapat menambah admin.'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO target_user_id
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User dengan email tersebut belum terdaftar.'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.admin_users (user_id, created_by)
  VALUES (target_user_id, auth.uid())
  ON CONFLICT (user_id) DO NOTHING;

  RETURN target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_admin_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_admin_actor() THEN
    RAISE EXCEPTION 'Akses ditolak: hanya admin yang dapat mencabut admin.'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Akun admin yang sedang digunakan tidak dapat mencabut dirinya sendiri.'
      USING ERRCODE = '42501';
  END IF;

  IF (SELECT count(*) FROM public.admin_users) <= 1 THEN
    RAISE EXCEPTION 'Admin terakhir tidak dapat dihapus.'
      USING ERRCODE = '23514';
  END IF;

  DELETE FROM public.admin_users WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Admin tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.list_admin_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_admin_user_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_admin_user(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_admin_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_admin_user_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_admin_user(uuid) TO authenticated;

