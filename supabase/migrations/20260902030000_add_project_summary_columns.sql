alter table public.user_projects
  add column if not exists stage text not null default 'project',
  add column if not exists status text not null default 'in_progress',
  add column if not exists grand_total numeric(18,2) not null default 0,
  add column if not exists total_items integer not null default 0,
  add column if not exists total_quantity numeric(18,4) not null default 0,
  add column if not exists completed_at timestamptz;

alter table public.user_projects
  drop constraint if exists user_projects_stage_check,
  add constraint user_projects_stage_check check (stage in ('project', 'components', 'summary')),
  drop constraint if exists user_projects_status_check,
  add constraint user_projects_status_check check (status in ('in_progress', 'completed')),
  drop constraint if exists user_projects_grand_total_check,
  add constraint user_projects_grand_total_check check (grand_total >= 0),
  drop constraint if exists user_projects_total_items_check,
  add constraint user_projects_total_items_check check (total_items >= 0),
  drop constraint if exists user_projects_total_quantity_check,
  add constraint user_projects_total_quantity_check check (total_quantity >= 0);

create or replace function public.sync_user_project_summary()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  derived_stage text;
  derived_total numeric(18,2) := 0;
  derived_items integer := 0;
  derived_quantity numeric(18,4) := 0;
begin
  derived_stage := coalesce(new.project_data->>'step', 'project');
  if derived_stage not in ('project', 'components', 'summary') then
    derived_stage := 'project';
  end if;

  select
    count(*)::integer,
    coalesce(sum(case
      when coalesce(part->>'quantity', '') ~ '^[0-9]+([.][0-9]+)?$'
      then (part->>'quantity')::numeric else 0 end), 0)::numeric(18,4),
    coalesce(sum(
      (case when coalesce(part->>'quantity', '') ~ '^[0-9]+([.][0-9]+)?$'
        then (part->>'quantity')::numeric else 0 end) *
      (case when coalesce(part->>'price', '') ~ '^[0-9]+([.][0-9]+)?$'
        then (part->>'price')::numeric else 0 end)
    ), 0)::numeric(18,2)
  into derived_items, derived_quantity, derived_total
  from jsonb_array_elements(coalesce(new.project_data->'floors', '[]'::jsonb)) floor_item
  cross join lateral jsonb_array_elements(coalesce(floor_item->'rooms', '[]'::jsonb)) room_item
  cross join lateral jsonb_array_elements(coalesce(room_item->'parts', '[]'::jsonb)) part;

  new.stage := derived_stage;
  new.total_items := derived_items;
  new.total_quantity := derived_quantity;
  new.grand_total := derived_total;

  if derived_stage = 'summary'
     or coalesce(new.project_data->'completedSteps', '[]'::jsonb) ? 'summary'
     or (tg_op = 'UPDATE' and old.status = 'completed') then
    new.status := 'completed';
    new.completed_at := coalesce(
      case when tg_op = 'UPDATE' then old.completed_at end,
      new.completed_at,
      now()
    );
  else
    new.status := 'in_progress';
    new.completed_at := null;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_user_project_summary() from public, anon, authenticated;

drop trigger if exists sync_user_project_summary_trigger on public.user_projects;
create trigger sync_user_project_summary_trigger
before insert or update of project_data on public.user_projects
for each row execute function public.sync_user_project_summary();

update public.user_projects set project_data = project_data;
