create unique index if not exists viewing_card_templates_system_name_uidx
  on public.viewing_card_templates (name)
  where is_system = true;

insert into public.viewing_card_templates (owner_user_id, name, icon, sort_order, is_system)
select null, seed.name, seed.icon, seed.sort_order, true
from (
  values
    (1, '第一眼與氣味', '👃'),
    (2, '採光', '☀️'),
    (3, '格局與動線', '🚶'),
    (4, '廚房', '🍳'),
    (5, '衛浴與水壓', '🚿'),
    (6, '牆面與地板', '🧱'),
    (7, '收納', '📦'),
    (8, '隔音', '🔇'),
    (9, '車位與儲藏', '🅿️'),
    (10, '周邊', '🌳'),
    (11, '整體感覺', '✨')
) as seed(sort_order, name, icon)
where not exists (
  select 1
  from public.viewing_card_templates existing
  where existing.is_system = true
    and existing.name = seed.name
);

create or replace function public.protect_system_card_template_name()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.is_system and new.name is distinct from old.name then
    raise exception 'system viewing card template name cannot change';
  end if;
  if old.is_system and new.is_system is distinct from true then
    raise exception 'system viewing card template cannot be demoted';
  end if;
  return new;
end;
$$;

drop trigger if exists viewing_card_templates_protect_system_name on public.viewing_card_templates;
create trigger viewing_card_templates_protect_system_name
  before update on public.viewing_card_templates
  for each row
  execute function public.protect_system_card_template_name();

revoke all on function public.protect_system_card_template_name() from public, anon, authenticated;
