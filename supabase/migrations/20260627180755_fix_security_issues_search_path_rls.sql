/*
# Fix security issues: mutable search_path, RLS on users table

## 1. Function search_path mutable
The `update_updated_at_column()` function was created without an explicit
`search_path`, making it vulnerable to search_path hijacking. Recreate it with
`SET search_path = pg_catalog, public` so it always resolves in a predictable
schema order. Dependent triggers must be recreated after.

## 2. RLS Enabled No Policy on public.users
The `users` table had RLS enabled but zero policies. Add an owner-scoped SELECT
policy so authenticated users can read their own row. The FastAPI backend
uses a direct Postgres connection (bypasses RLS) for inserts/updates, so no
INSERT/UPDATE/DELETE policies are needed.
*/

-- 1. Drop function with CASCADE (removes dependent triggers too)
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

-- Recreate with immutable search_path
CREATE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate triggers that were dropped by CASCADE
DROP TRIGGER IF EXISTS trg_user_projects_updated_at ON public.user_projects;
CREATE TRIGGER trg_user_projects_updated_at
  BEFORE UPDATE ON public.user_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_rab_reports_updated_at ON public.rab_reports;
CREATE TRIGGER trg_rab_reports_updated_at
  BEFORE UPDATE ON public.rab_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Add RLS policy to public.users (owner-scoped SELECT)
DROP POLICY IF EXISTS "select_own_user_row" ON public.users;
CREATE POLICY "select_own_user_row" ON public.users FOR SELECT
  TO authenticated USING (auth.uid()::text = id::text);
