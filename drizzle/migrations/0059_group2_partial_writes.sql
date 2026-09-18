-- Group 2: rulări blocate, import atomic de prospect, versiune de rollback marketing.

alter table public.ai_workflow_runs
  add column if not exists claimed_at timestamptz;

create index if not exists ai_workflow_runs_claimed_idx
  on public.ai_workflow_runs (status, claimed_at);

alter table public.marketing_drafts
  add column if not exists source text not null default 'ai_generated';

create or replace function public.prospect_import_to_crm(
  _org uuid,
  _actor uuid,
  _prospect uuid,
  _phone text default null,
  _link_contact uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  v_existing record;
  v_contact uuid;
  v_lead uuid;
  v_name text;
  v_parts text[];
  v_first text;
  v_last text;
begin
  select * into p from prospects
   where id = _prospect and organization_id = _org;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if p.status = 'imported' and p.imported_lead_id is not null then
    return jsonb_build_object(
      'ok', true, 'status', 'already_imported',
      'contactId', p.imported_contact_id, 'leadId', p.imported_lead_id);
  end if;
  if p.status <> 'approved' then
    return jsonb_build_object('ok', false, 'code', 'not_approved');
  end if;

  if _link_contact is not null then
    select id into v_contact from contacts
     where id = _link_contact and organization_id = _org;
    if v_contact is null then
      return jsonb_build_object('ok', false, 'code', 'not_found');
    end if;
  elsif _phone is not null then
    select id, first_name, last_name, phone into v_existing from contacts
     where organization_id = _org and phone = _phone
     limit 1;
    if v_existing.id is not null then
      return jsonb_build_object(
        'ok', false, 'code', 'needs_link',
        'existingContact', jsonb_build_object(
          'id', v_existing.id,
          'name', btrim(coalesce(v_existing.first_name, '') || ' ' || coalesce(v_existing.last_name, '')),
          'phone', v_existing.phone));
    end if;
  end if;

  if v_contact is null then
    v_name := btrim(coalesce(p.seller_name, ''));
    if v_name = '' then
      v_first := 'Proprietar';
      v_last := 'prospect';
    else
      v_parts := regexp_split_to_array(v_name, '\s+');
      v_first := v_parts[1];
      v_last := coalesce(nullif(array_to_string(v_parts[2:], ' '), ''), '-');
    end if;
    insert into contacts (
      organization_id, created_by, assigned_to, first_name, last_name,
      phone, type, source, notes)
    values (
      _org, _actor, _actor, v_first, v_last,
      _phone, 'owner', 'prospecting',
      case when p.source_url is not null then 'Sursă prospect: ' || p.source_url end)
    returning id into v_contact;
  end if;

  insert into leads (
    organization_id, created_by, assigned_to, contact_id, name, phone,
    stage, source, score, value, notes)
  values (
    _org, _actor, _actor, v_contact, left(p.title, 160), _phone,
    'new', 'prospecting', coalesce(p.opportunity_score, 0), p.price,
    nullif(concat_ws(E'\n',
      case when p.source_url is not null then 'Anunț: ' || p.source_url end,
      case when p.city is not null then 'Localitate: ' || p.city end,
      case when p.seller_type is not null then 'Tip vânzător: ' || p.seller_type end), ''))
  returning id into v_lead;

  update prospects
     set status = 'imported',
         imported_contact_id = v_contact,
         imported_lead_id = v_lead,
         updated_at = now()
   where id = _prospect and organization_id = _org;

  insert into prospect_reviews (
    organization_id, prospect_id, reviewer_id, decision, notes)
  values (
    _org, _prospect, _actor,
    case when _link_contact is not null then 'linked' else 'imported' end,
    case when _link_contact is not null
      then 'Asociat unui contact existent.' else 'Import nou în CRM.' end);

  return jsonb_build_object(
    'ok', true, 'status', 'imported', 'contactId', v_contact, 'leadId', v_lead);
end;
$$;

revoke all on function public.prospect_import_to_crm(uuid, uuid, uuid, text, uuid) from public;
grant execute on function public.prospect_import_to_crm(uuid, uuid, uuid, text, uuid) to service_role;