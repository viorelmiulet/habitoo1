CREATE OR REPLACE FUNCTION public.superadmin_delete_organization(_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _name text;
  _counts jsonb := '{}'::jsonb;
  _user_ids uuid[];
  _n bigint;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Doar un superadmin poate șterge definitiv o agenție.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT name INTO _name FROM public.organizations WHERE id = _org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agenția nu există.' USING ERRCODE = 'no_data_found';
  END IF;

  -- Conturile de autentificare care vor fi eliminate ulterior (fără superadmini).
  SELECT coalesce(array_agg(p.id), '{}') INTO _user_ids
  FROM public.profiles p
  WHERE p.organization_id = _org
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'superadmin'
    );

  SELECT jsonb_object_agg(t, c) INTO _counts FROM (
    SELECT 'properties' t, count(*) c FROM public.properties WHERE organization_id = _org
    UNION ALL SELECT 'property_images', count(*) FROM public.property_images WHERE organization_id = _org
    UNION ALL SELECT 'property_favorites', count(*) FROM public.property_favorites WHERE organization_id = _org
    UNION ALL SELECT 'contacts', count(*) FROM public.contacts WHERE organization_id = _org
    UNION ALL SELECT 'leads', count(*) FROM public.leads WHERE organization_id = _org
    UNION ALL SELECT 'lead_events', count(*) FROM public.lead_events WHERE organization_id = _org
    UNION ALL SELECT 'activities', count(*) FROM public.activities WHERE organization_id = _org
    UNION ALL SELECT 'requests', count(*) FROM public.requests WHERE organization_id = _org
    UNION ALL SELECT 'documents', count(*) FROM public.documents WHERE organization_id = _org
    UNION ALL SELECT 'goals', count(*) FROM public.goals WHERE organization_id = _org
    UNION ALL SELECT 'notifications', count(*) FROM public.notifications WHERE organization_id = _org
    UNION ALL SELECT 'saved_views', count(*) FROM public.saved_views WHERE organization_id = _org
    UNION ALL SELECT 'portal_connections', count(*) FROM public.portal_connections WHERE organization_id = _org
    UNION ALL SELECT 'portal_integrations', count(*) FROM public.portal_integrations WHERE organization_id = _org
    UNION ALL SELECT 'portal_listings', count(*) FROM public.portal_listings WHERE organization_id = _org
    UNION ALL SELECT 'portal_publications', count(*) FROM public.portal_publications WHERE organization_id = _org
    UNION ALL SELECT 'portal_api_keys', count(*) FROM public.portal_api_keys WHERE organization_id = _org
    UNION ALL SELECT 'portal_operation_logs', count(*) FROM public.portal_operation_logs WHERE organization_id = _org
    UNION ALL SELECT 'site_feed_tokens', count(*) FROM public.site_feed_tokens WHERE organization_id = _org
    UNION ALL SELECT 'site_feed_visits', count(*) FROM public.site_feed_visits WHERE organization_id = _org
    UNION ALL SELECT 'site_feed_access_logs', count(*) FROM public.site_feed_access_logs WHERE organization_id = _org
    UNION ALL SELECT 'profiles', count(*) FROM public.profiles WHERE organization_id = _org
    UNION ALL SELECT 'user_roles', count(*) FROM public.user_roles WHERE organization_id = _org
    UNION ALL SELECT 'audit_logs', count(*) FROM public.audit_logs WHERE organization_id = _org
  ) s;

  -- Urmă permanentă: fără organization_id, ca ștergerea în cascadă să nu o elimine.
  INSERT INTO public.audit_logs (organization_id, actor_id, action, entity, entity_id, old_values, new_values, created_by)
  VALUES (
    NULL, _actor, 'organization.hard_deleted', 'organizations', _org,
    jsonb_build_object('organization_id', _org, 'name', _name),
    jsonb_build_object(
      'organization_id', _org,
      'name', _name,
      'deleted_by', _actor,
      'deleted_at', now(),
      'deleted_rows', _counts,
      'auth_users', to_jsonb(_user_ids)
    ),
    _actor
  );

  -- Rolurile non-superadmin ale membrilor (unele rânduri pot avea organization_id NULL).
  DELETE FROM public.user_roles r
  WHERE r.role <> 'superadmin' AND (r.organization_id = _org OR r.user_id = ANY(_user_ids));

  -- Restul datelor dispar prin ON DELETE CASCADE de pe organizations.
  DELETE FROM public.organizations WHERE id = _org;

  RETURN jsonb_build_object(
    'organization_id', _org,
    'name', _name,
    'deleted_rows', _counts,
    'auth_user_ids', to_jsonb(_user_ids)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.superadmin_delete_organization(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.superadmin_delete_organization(uuid) TO authenticated, service_role;