/*
# Fix app_settings RLS for admin actor

Align app_settings write access with app admin logic (email contains admin OR users.is_admin = true).
*/

CREATE OR REPLACE FUNCTION public.is_admin_actor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(LOWER(auth.jwt() ->> 'email'), '') LIKE '%admin%'
    OR EXISTS (
      SELECT 1
      FROM public.users
      WHERE id = auth.uid()
        AND is_admin = TRUE
    );
$$;

REVOKE ALL ON FUNCTION public.is_admin_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_actor() TO authenticated;

DROP POLICY IF EXISTS "app_settings_insert" ON public.app_settings;
CREATE POLICY "app_settings_insert" ON public.app_settings FOR INSERT
  TO authenticated WITH CHECK (public.is_admin_actor());

DROP POLICY IF EXISTS "app_settings_update" ON public.app_settings;
CREATE POLICY "app_settings_update" ON public.app_settings FOR UPDATE
  TO authenticated USING (public.is_admin_actor()) WITH CHECK (public.is_admin_actor());
