CREATE TABLE public.immoflux_connections (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
 host text NOT NULL,
 slug text NOT NULL,
 api_key_encrypted text NOT NULL CHECK (api_key_encrypted LIKE 'v1.%'),
 credential_digest text NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT immoflux_connection_identity UNIQUE(host,slug,credential_digest)
);
GRANT SELECT (organization_id,host,slug,enabled,updated_at) ON public.immoflux_connections TO authenticated;
GRANT ALL ON public.immoflux_connections TO service_role;
ALTER TABLE public.immoflux_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY immoflux_superadmin_read ON public.immoflux_connections FOR SELECT TO authenticated USING (public.is_superadmin());
CREATE FUNCTION public.save_immoflux_connection(_organization_id uuid, _host text, _slug text, _encrypted text, _digest text, _enabled boolean, _actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior public.immoflux_connections;
BEGIN
 IF coalesce(auth.role(),'') <> 'service_role' OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_actor AND role='superadmin') THEN RAISE EXCEPTION 'Acces refuzat: doar SuperAdmin.' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.organizations WHERE id=_organization_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agenția nu există.'; END IF;
 SELECT * INTO prior FROM public.immoflux_connections WHERE organization_id=_organization_id FOR UPDATE;
 IF _host !~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*immoflux\.ro$' OR _slug !~ '^[a-zA-Z0-9_-]{1,150}$' THEN RAISE EXCEPTION 'Host sau slug IMMOFLUX invalid.'; END IF;
 IF prior.organization_id IS NULL AND (_encrypted IS NULL OR _digest IS NULL) THEN RAISE EXCEPTION 'Cheia API este obligatorie.'; END IF;
 BEGIN
 INSERT INTO public.immoflux_connections(organization_id,host,slug,api_key_encrypted,credential_digest,enabled,updated_by)
 VALUES(_organization_id,_host,_slug,coalesce(_encrypted,prior.api_key_encrypted),coalesce(_digest,prior.credential_digest),_enabled,_actor)
 ON CONFLICT(organization_id) DO UPDATE SET host=EXCLUDED.host,slug=EXCLUDED.slug,api_key_encrypted=EXCLUDED.api_key_encrypted,credential_digest=EXCLUDED.credential_digest,enabled=EXCLUDED.enabled,updated_by=_actor,updated_at=now();
 EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Această configurare IMMOFLUX este deja folosită de altă agenție.' USING ERRCODE='23505'; END;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,new_values,created_by)
 VALUES(_organization_id,_actor,'immoflux.saved','immoflux_connections',_organization_id,jsonb_build_object('host',_host,'slug',_slug,'enabled',_enabled),_actor);
 IF prior.enabled IS DISTINCT FROM _enabled THEN
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,new_values,created_by)
 VALUES(_organization_id,_actor,CASE WHEN _enabled THEN 'immoflux.enabled' ELSE 'immoflux.disabled' END,'immoflux_connections',_organization_id,jsonb_build_object('enabled',_enabled),_actor);
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.save_immoflux_connection(uuid,text,text,text,text,boolean,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_immoflux_connection(uuid,text,text,text,text,boolean,uuid) TO service_role;