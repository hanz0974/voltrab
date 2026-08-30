-- Store application administrators by immutable Supabase Auth user ID.

CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Admin membership is checked through the SECURITY DEFINER function below.
-- Direct access through the Data API remains closed.
REVOKE ALL ON TABLE public.admin_users FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_admin_actor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users
    WHERE user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_actor() TO authenticated;

