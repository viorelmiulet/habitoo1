ALTER TABLE public.dynamic_feed_portals ADD COLUMN integration_mode text NOT NULL DEFAULT 'feed' CHECK (integration_mode IN ('feed','api','both')), ADD COLUMN rate_limit_per_minute integer NOT NULL DEFAULT 120 CHECK (rate_limit_per_minute BETWEEN 1 AND 100000);
ALTER TABLE public.portal_index_keys ADD COLUMN key_type text NOT NULL DEFAULT 'index' CHECK (key_type IN ('index','api')), ADD COLUMN environment text NOT NULL DEFAULT 'live' CHECK (environment IN ('test','live'));
CREATE UNIQUE INDEX partner_api_key_digest_unique ON public.portal_index_keys(key_hash) WHERE key_type='api';
CREATE TABLE public.partner_api_rate_windows (key_id uuid NOT NULL REFERENCES public.portal_index_keys(id) ON DELETE CASCADE, window_start timestamptz NOT NULL, request_count integer NOT NULL DEFAULT 1, PRIMARY KEY(key_id,window_start));
GRANT ALL ON public.partner_api_rate_windows TO service_role;
ALTER TABLE public.partner_api_rate_windows ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.partner_api_idempotency (portal text NOT NULL REFERENCES public.dynamic_feed_portals(slug), environment text NOT NULL CHECK(environment IN ('test','live')), idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 200), request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'), owner_id uuid NOT NULL, response_status integer, response_body text, response_headers jsonb, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours', PRIMARY KEY(portal,environment,idempotency_key));
GRANT ALL ON public.partner_api_idempotency TO service_role;
ALTER TABLE public.partner_api_idempotency ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.partner_api_request_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL, portal text, key_prefix text, method text NOT NULL, path text NOT NULL, status integer NOT NULL, duration_ms integer NOT NULL, rate_check_failed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.partner_api_request_logs TO authenticated;
GRANT ALL ON public.partner_api_request_logs TO service_role;
ALTER TABLE public.partner_api_request_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY partner_api_logs_superadmin ON public.partner_api_request_logs FOR SELECT TO authenticated USING(public.is_superadmin());
CREATE INDEX partner_api_logs_recent ON public.partner_api_request_logs(created_at DESC);
CREATE TABLE public.partner_api_test_agencies (organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE);
GRANT SELECT,INSERT,DELETE ON public.partner_api_test_agencies TO authenticated;
GRANT ALL ON public.partner_api_test_agencies TO service_role;
ALTER TABLE public.partner_api_test_agencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY partner_api_test_superadmin ON public.partner_api_test_agencies FOR ALL TO authenticated USING(public.is_superadmin()) WITH CHECK(public.is_superadmin());
COMMENT ON TABLE public.partner_api_test_agencies IS 'Explicit Partner API test-environment allowlist, populated by P5; existing real/demo agencies are never inferred as test data.';
CREATE FUNCTION public.partner_api_rate_take(_key_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer; lim integer; w timestamptz:=date_trunc('minute',clock_timestamp());
BEGIN
 SELECT p.rate_limit_per_minute INTO lim FROM public.portal_index_keys k JOIN public.dynamic_feed_portals p ON p.slug=k.portal WHERE k.id=_key_id AND k.key_type='api';
 IF lim IS NULL THEN RAISE EXCEPTION 'Unknown API key'; END IF;
 INSERT INTO public.partner_api_rate_windows(key_id,window_start,request_count) VALUES(_key_id,w,1) ON CONFLICT(key_id,window_start) DO UPDATE SET request_count=partner_api_rate_windows.request_count+1 RETURNING request_count INTO n;
 RETURN jsonb_build_object('limit',lim,'remaining',greatest(lim-n,0),'allowed',n<=lim,'reset',extract(epoch FROM w+interval '1 minute')::bigint);
END $$;
REVOKE ALL ON FUNCTION public.partner_api_rate_take(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.partner_api_rate_take(uuid) TO service_role;
CREATE FUNCTION public.partner_api_idempotency_claim(_portal text,_environment text,_key text,_hash text,_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.partner_api_idempotency; inserted integer;
BEGIN
 DELETE FROM public.partner_api_idempotency WHERE portal=_portal AND environment=_environment AND idempotency_key=_key AND expires_at<=now();
 INSERT INTO public.partner_api_idempotency(portal,environment,idempotency_key,request_hash,owner_id) VALUES(_portal,_environment,_key,_hash,_owner) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 SELECT * INTO r FROM public.partner_api_idempotency WHERE portal=_portal AND environment=_environment AND idempotency_key=_key;
 IF r.request_hash<>_hash THEN RETURN jsonb_build_object('state','conflict'); END IF;
 IF inserted=1 THEN RETURN jsonb_build_object('state','claimed'); END IF;
 IF r.response_status IS NULL THEN RETURN jsonb_build_object('state','pending'); END IF;
 RETURN jsonb_build_object('state','replay','status',r.response_status,'body',r.response_body,'headers',r.response_headers);
END $$;
REVOKE ALL ON FUNCTION public.partner_api_idempotency_claim(text,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.partner_api_idempotency_claim(text,text,text,text,uuid) TO service_role;
CREATE FUNCTION public.partner_api_cleanup() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 DELETE FROM public.partner_api_rate_windows WHERE window_start<now()-interval '1 hour';
 DELETE FROM public.partner_api_idempotency WHERE expires_at<=now();
 DELETE FROM public.partner_api_request_logs WHERE created_at<now()-interval '30 days';
END $$;
REVOKE ALL ON FUNCTION public.partner_api_cleanup() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.partner_api_cleanup() TO service_role;
SELECT cron.schedule('partner-api-cleanup','13 * * * *','SELECT public.partner_api_cleanup()');
CREATE OR REPLACE FUNCTION public.portal_index_key_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
 INSERT INTO public.audit_logs(actor_id,action,entity,entity_id,new_values) VALUES(coalesce(auth.uid(),NEW.created_by),CASE WHEN NEW.key_type='api' THEN CASE WHEN NEW.status='revoked' THEN 'partner_api_key_revoked' ELSE 'partner_api_key_created' END ELSE CASE WHEN NEW.status='revoked' THEN 'portal_index_key_revoked' WHEN NEW.source='legacy' THEN 'portal_index_legacy_registered' ELSE 'portal_index_key_created' END END,'portal_index_keys',NEW.id,jsonb_build_object('portal',NEW.portal,'prefix',NEW.prefix,'last4',NEW.last4,'source',NEW.source,'status',NEW.status,'key_type',NEW.key_type,'environment',NEW.environment));
 END IF; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.dynamic_feed_portal_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 INSERT INTO public.audit_logs(actor_id,action,entity,new_values) VALUES(auth.uid(),CASE WHEN TG_OP='INSERT' THEN 'partner_portal_created' ELSE 'dynamic_feed_portal_updated' END,'dynamic_feed_portals',jsonb_build_object('slug',NEW.slug,'display_name',NEW.display_name,'website',NEW.website,'logo_path',NEW.logo_path,'active',NEW.active,'show_public',NEW.show_public,'integration_mode',NEW.integration_mode,'rate_limit_per_minute',NEW.rate_limit_per_minute)); RETURN NEW; END $$;
CREATE TRIGGER partner_portal_insert_audit AFTER INSERT ON public.dynamic_feed_portals FOR EACH ROW EXECUTE FUNCTION public.dynamic_feed_portal_audit();
CREATE FUNCTION public.guard_partner_api_key() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='UPDATE' AND (NEW.key_type<>OLD.key_type OR NEW.environment<>OLD.environment OR NEW.key_hash<>OLD.key_hash OR NEW.portal<>OLD.portal OR NEW.prefix<>OLD.prefix OR NEW.last4<>OLD.last4) THEN RAISE EXCEPTION 'Key identity is immutable'; END IF;
 IF NEW.key_type='api' AND (NEW.prefix NOT IN ('hbpk_test_','hbpk_live_') OR NEW.prefix<>'hbpk_'||NEW.environment||'_' OR NOT EXISTS(SELECT 1 FROM public.dynamic_feed_portals WHERE slug=NEW.portal)) THEN RAISE EXCEPTION 'Invalid API key identity'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER partner_api_key_guard BEFORE INSERT OR UPDATE ON public.portal_index_keys FOR EACH ROW EXECUTE FUNCTION public.guard_partner_api_key();