-- Consolidate application users and administrators into public.users.
--
-- Supabase Auth remains the authentication source. This public table stores the
-- application profile and authorization role used by the Data API, RLS, RPCs,
-- and the backend.

CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE,
  role text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  role_assigned_at timestamptz,
  role_assigned_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'))
);

CREATE INDEX users_role_idx ON public.users(role);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Roles must only be changed through the guarded administrator RPCs below.
REVOKE ALL ON TABLE public.users FROM anon, authenticated;

INSERT INTO public.users (id, email, created_at)
SELECT id, email::text, created_at
FROM auth.users
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email;

-- Preserve every existing administrator before removing the old membership table.
UPDATE public.users AS u
SET
  role = 'admin',
  role_assigned_at = au.created_at,
  role_assigned_by = au.created_by
FROM public.admin_users AS au
WHERE u.id = au.user_id;

CREATE OR REPLACE FUNCTION public.sync_auth_user_to_public_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, email, created_at)
  VALUES (NEW.id, NEW.email::text, NEW.created_at)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_auth_user_to_public_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_auth_user_to_public_users() FROM anon, authenticated;

DROP TRIGGER IF EXISTS sync_auth_user_to_public_users ON auth.users;
CREATE TRIGGER sync_auth_user_to_public_users
AFTER INSERT OR UPDATE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_auth_user_to_public_users();

CREATE OR REPLACE FUNCTION public.is_admin_actor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = (SELECT auth.uid())
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_actor() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_admin_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin_actor() THEN
    RAISE EXCEPTION 'Akses ditolak: hanya admin yang dapat melihat daftar admin.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email,
    COALESCE(u.role_assigned_at, u.created_at)
  FROM public.users AS u
  WHERE u.role = 'admin'
  ORDER BY COALESCE(u.role_assigned_at, u.created_at) ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_admin_user_by_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_user_id uuid;
BEGIN
  IF NOT public.is_admin_actor() THEN
    RAISE EXCEPTION 'Akses ditolak: hanya admin yang dapat menambah admin.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.users AS u
  SET
    role = 'admin',
    role_assigned_at = CASE
      WHEN u.role = 'admin' THEN COALESCE(u.role_assigned_at, now())
      ELSE now()
    END,
    role_assigned_by = CASE
      WHEN u.role = 'admin' THEN u.role_assigned_by
      ELSE (SELECT auth.uid())
    END
  WHERE lower(u.email) = lower(btrim(p_email))
  RETURNING u.id INTO target_user_id;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User dengan email tersebut belum terdaftar.'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_admin_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin_actor() THEN
    RAISE EXCEPTION 'Akses ditolak: hanya admin yang dapat mencabut admin.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = p_user_id
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;

  IF p_user_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'Akun admin yang sedang digunakan tidak dapat mencabut dirinya sendiri.'
      USING ERRCODE = '42501';
  END IF;

  IF (SELECT count(*) FROM public.users WHERE role = 'admin') <= 1 THEN
    RAISE EXCEPTION 'Admin terakhir tidak dapat dihapus.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.users
  SET
    role = 'user',
    role_assigned_at = NULL,
    role_assigned_by = NULL
  WHERE id = p_user_id
    AND role = 'admin';
END;
$$;

REVOKE ALL ON FUNCTION public.list_admin_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_admin_user_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_admin_user(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_admin_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_admin_user_by_email(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_admin_user(uuid) TO authenticated;

DROP TABLE public.admin_users;

COMMENT ON TABLE public.users IS
  'Application users synchronized from Supabase Auth, including their user or admin role.';
COMMENT ON COLUMN public.users.role IS
  'Application authorization role: user or admin.';

-- Remove explicit legacy anonymous grants as well as PUBLIC grants.
REVOKE EXECUTE ON FUNCTION public.is_admin_actor(), public.list_admin_users(), public.add_admin_user_by_email(text), public.remove_admin_user(uuid) FROM anon;
