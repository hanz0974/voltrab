-- Remove the legacy FastAPI authentication table only after all application
-- code has moved to Supabase Auth and public.admin_users.
--
-- RESTRICT is intentional: the migration must fail instead of cascading when
-- an active view, foreign key, function, trigger, or other database object
-- still depends on public.users.

DROP POLICY IF EXISTS "select_own_user_row" ON public.users;
DROP TABLE public.users RESTRICT;
