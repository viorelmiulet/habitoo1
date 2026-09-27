with revoked as (
  update public.portal_api_keys
     set status = 'revoked', revoked_at = now(), updated_at = now()
   where portal = 'properstar' and status = 'active'
  returning organization_id
)
insert into public.audit_logs (organization_id, actor_id, action, entity, new_values)
select null, null, 'portal.properstar.keys_revoked', 'portal_api_keys',
       jsonb_build_object('revoked_count', count(*), 'organizations', count(distinct organization_id),
                          'reason', 'Properstar se distribuie doar prin indexul protejat')
  from revoked;