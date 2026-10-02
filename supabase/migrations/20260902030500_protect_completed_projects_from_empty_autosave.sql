-- Keep a completed, priced project from being erased by a stale empty autosave.
-- The full trigger definition is installed by the matching remote migration.
-- See 20260902030000_add_project_summary_columns.sql for the base trigger.

create or replace function public.protect_completed_project_snapshot()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status = 'completed'
     and old.grand_total > 0
     and coalesce(new.project_data->>'step', 'project') <> 'summary'
     and not jsonb_path_exists(
       coalesce(new.project_data, '{}'::jsonb),
       '$.floors[*].rooms[*].parts[*]'
     ) then
    new.project_data := old.project_data;
    new.stage := old.stage;
    new.status := old.status;
    new.grand_total := old.grand_total;
    new.total_items := old.total_items;
    new.total_quantity := old.total_quantity;
    new.completed_at := old.completed_at;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_completed_project_snapshot()
from public, anon, authenticated;

drop trigger if exists protect_completed_project_snapshot_trigger
on public.user_projects;

create trigger protect_completed_project_snapshot_trigger
before update of project_data on public.user_projects
for each row
when (old.status = 'completed' and old.grand_total > 0)
execute function public.protect_completed_project_snapshot();
