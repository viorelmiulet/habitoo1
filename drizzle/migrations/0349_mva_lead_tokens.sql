CREATE TABLE public.mva_lead_tokens (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
 token_hash text CHECK (token_hash IS NULL OR token_hash ~ '^[a-f0-9]{64}$'),
 credential_hash text CHECK (credential_hash IS NULL OR credential_hash ~ '^[a-f0-9]{64}$'),
 issued_at timestamptz,
 delivered_at timestamptz,
 claim_token uuid,
 locked_until timestamptz
);
GRANT ALL ON public.mva_lead_tokens TO service_role;
ALTER TABLE public.mva_lead_tokens ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX mva_lead_tokens_hash ON public.mva_lead_tokens(token_hash) WHERE token_hash IS NOT NULL;

CREATE FUNCTION public.claim_mva_lead_delivery(_org uuid,_credential_hash text,_encrypted text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.mva_lead_tokens; claim uuid;
BEGIN
 IF _credential_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid credential fingerprint'; END IF;
 PERFORM 1 FROM public.portal_connections WHERE organization_id=_org AND portal='mvaimobiliare' AND activated=true AND portal_credentials_encrypted=_encrypted FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conexiunea mvaimobiliare.ro s-a schimbat. Repetă testul.'; END IF;
 INSERT INTO public.mva_lead_tokens(organization_id) VALUES(_org) ON CONFLICT DO NOTHING;
 SELECT * INTO r FROM public.mva_lead_tokens WHERE organization_id=_org FOR UPDATE;
 IF r.credential_hash=_credential_hash AND r.delivered_at IS NOT NULL THEN RETURN jsonb_build_object('mode','existing'); END IF;
 IF r.locked_until>now() THEN RAISE EXCEPTION 'Livrarea tokenului mvaimobiliare.ro este deja în curs. Repetă testul.'; END IF;
 claim:=gen_random_uuid();
 UPDATE public.mva_lead_tokens SET credential_hash=_credential_hash,claim_token=claim,locked_until=now()+interval '90 seconds',
 token_hash=CASE WHEN credential_hash IS DISTINCT FROM _credential_hash THEN NULL ELSE token_hash END,
 issued_at=CASE WHEN credential_hash IS DISTINCT FROM _credential_hash THEN NULL ELSE issued_at END,
 delivered_at=NULL WHERE organization_id=_org;
 RETURN jsonb_build_object('mode','new','claim_token',claim,'token_hash',CASE WHEN r.credential_hash=_credential_hash THEN r.token_hash ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION public.claim_mva_lead_delivery(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mva_lead_delivery(uuid,text,text) TO service_role;

CREATE FUNCTION public.store_mva_lead_token_hash(_org uuid,_claim uuid,_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF _hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid token fingerprint'; END IF;
 UPDATE public.mva_lead_tokens SET token_hash=_hash,issued_at=CASE WHEN token_hash IS DISTINCT FROM _hash THEN now() ELSE issued_at END
 WHERE organization_id=_org AND claim_token=_claim AND locked_until>now();
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.store_mva_lead_token_hash(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.store_mva_lead_token_hash(uuid,uuid,text) TO service_role;

CREATE FUNCTION public.finish_mva_lead_delivery(_org uuid,_claim uuid,_delivered boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.mva_lead_tokens SET delivered_at=CASE WHEN _delivered THEN now() ELSE NULL END,claim_token=NULL,locked_until=NULL
 WHERE organization_id=_org AND claim_token=_claim AND token_hash IS NOT NULL;
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.finish_mva_lead_delivery(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_mva_lead_delivery(uuid,uuid,boolean) TO service_role;

CREATE FUNCTION public.invalidate_mva_lead_token() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF OLD.portal='mvaimobiliare' AND (TG_OP='DELETE' OR OLD.portal_credentials_encrypted IS DISTINCT FROM NEW.portal_credentials_encrypted) THEN
 UPDATE public.mva_lead_tokens SET token_hash=NULL,credential_hash=NULL,issued_at=NULL,delivered_at=NULL,claim_token=NULL,locked_until=NULL WHERE organization_id=OLD.organization_id;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.invalidate_mva_lead_token() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER mva_lead_token_key_changed AFTER UPDATE OF portal_credentials_encrypted ON public.portal_connections FOR EACH ROW EXECUTE FUNCTION public.invalidate_mva_lead_token();
CREATE TRIGGER mva_lead_token_connection_deleted AFTER DELETE ON public.portal_connections FOR EACH ROW EXECUTE FUNCTION public.invalidate_mva_lead_token();