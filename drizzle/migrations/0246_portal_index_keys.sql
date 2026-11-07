CREATE TABLE public.portal_index_keys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 portal text NOT NULL CHECK (portal IN ('clickimob','imobli','locuit','imobiliareplus','imove','bazaruldecase')),
 prefix text NOT NULL,
 last4 text NOT NULL CHECK (length(last4)=4),
 key_hash text NOT NULL CHECK (key_hash ~ '^[a-f0-9]{64}$'),
 source text NOT NULL DEFAULT 'managed' CHECK (source IN ('managed','legacy')),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid,
 last_used_at timestamptz,
 revoked_at timestamptz,
 UNIQUE (portal,key_hash)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_index_keys TO authenticated;
GRANT ALL ON public.portal_index_keys TO service_role;
ALTER TABLE public.portal_index_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_index_keys_superadmin ON public.portal_index_keys FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE FUNCTION public.portal_index_key_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
  INSERT INTO public.audit_logs(actor_id,action,entity,entity_id,new_values)
  VALUES (coalesce(auth.uid(),NEW.created_by),CASE WHEN NEW.status='revoked' THEN 'portal_index_key_revoked' WHEN NEW.source='legacy' THEN 'portal_index_legacy_registered' ELSE 'portal_index_key_created' END,'portal_index_keys',NEW.id,jsonb_build_object('portal',NEW.portal,'prefix',NEW.prefix,'last4',NEW.last4,'source',NEW.source,'status',NEW.status));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER portal_index_keys_audit AFTER INSERT OR UPDATE ON public.portal_index_keys FOR EACH ROW EXECUTE FUNCTION public.portal_index_key_audit();
CREATE FUNCTION public.portal_index_key_touch(_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.portal_index_keys SET last_used_at=now() WHERE id=_id AND status='active' AND (last_used_at IS NULL OR last_used_at<=now()-interval '5 minutes');
$$;
REVOKE ALL ON FUNCTION public.portal_index_key_touch(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.portal_index_key_touch(uuid) TO service_role;