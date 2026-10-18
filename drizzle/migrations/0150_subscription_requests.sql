CREATE TABLE public.subscription_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 plan text NOT NULL CHECK (plan IN ('basic','pro','unlimited')),
 term text NOT NULL CHECK (term IN ('30d','12m')),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
 note text CHECK (length(note) <= 1000),
 requested_by uuid NOT NULL,
 requested_at timestamptz NOT NULL DEFAULT now(),
 resolved_by uuid,
 resolved_at timestamptz,
 rejection_reason text CHECK (length(rejection_reason) <= 1000)
);
GRANT SELECT, INSERT ON public.subscription_requests TO authenticated;
GRANT ALL ON public.subscription_requests TO service_role;
ALTER TABLE public.subscription_requests ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.subscription_request_org() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT p.organization_id FROM public.profiles p WHERE p.id=auth.uid() AND EXISTS (
 SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.organization_id=p.organization_id AND r.role='agency_admin')
 AND NOT public.is_superadmin();
$$;
REVOKE ALL ON FUNCTION public.subscription_request_org() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscription_request_org() TO authenticated, service_role;
CREATE POLICY subscription_requests_read ON public.subscription_requests FOR SELECT TO authenticated USING (public.is_superadmin() OR organization_id=public.subscription_request_org());
CREATE POLICY subscription_requests_create ON public.subscription_requests FOR INSERT TO authenticated WITH CHECK (organization_id=public.subscription_request_org() AND requested_by=auth.uid() AND status='pending' AND resolved_by IS NULL AND resolved_at IS NULL AND rejection_reason IS NULL);
CREATE UNIQUE INDEX subscription_requests_one_pending ON public.subscription_requests(organization_id) WHERE status='pending';

CREATE FUNCTION public.subscription_request_before_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _used integer; _limit integer;
BEGIN
 IF auth.uid() IS NULL OR NEW.organization_id IS DISTINCT FROM public.subscription_request_org() OR NEW.requested_by IS DISTINCT FROM auth.uid() OR NEW.status<>'pending' OR NEW.resolved_at IS NOT NULL OR NEW.resolved_by IS NOT NULL OR NEW.rejection_reason IS NOT NULL THEN RAISE EXCEPTION 'Doar administratorul agenției poate trimite cererea.'; END IF;
 PERFORM 1 FROM public.organizations WHERE id=NEW.organization_id FOR UPDATE;
 SELECT used INTO _used FROM public.org_seat_usage(NEW.organization_id);
 _limit := public.plan_agent_limit(NEW.plan);
 IF _limit IS NOT NULL AND _used>_limit THEN RAISE EXCEPTION 'Planul permite % agenți, dar agenția are % agenți activi.', _limit, _used; END IF;
 NEW.requested_at:=now();
 RETURN NEW;
END; $$;
CREATE TRIGGER subscription_request_validate BEFORE INSERT ON public.subscription_requests FOR EACH ROW EXECUTE FUNCTION public.subscription_request_before_insert();

CREATE FUNCTION public.subscription_request_notify() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _agency text; _label text; _period text;
BEGIN
 SELECT name INTO _agency FROM public.organizations WHERE id=NEW.organization_id;
 _label:=CASE NEW.plan WHEN 'basic' THEN 'Basic' WHEN 'pro' THEN 'Pro' ELSE 'Unlimited' END;
 _period:=CASE NEW.term WHEN '12m' THEN 'anual' ELSE 'lunar' END;
 INSERT INTO public.notifications(organization_id,user_id,type,title,body,link,created_by)
 SELECT NULL,r.user_id,'subscription_request','Cerere abonament: '||_agency||' – '||_label||' '||_period,NEW.note,'/superadmin/cereri-abonament?request='||NEW.id::text,NEW.requested_by FROM (SELECT DISTINCT user_id FROM public.user_roles WHERE role='superadmin') r;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,new_values,created_by)
 VALUES(NEW.organization_id,auth.uid(),'subscription.requested','subscription_requests',NEW.id,jsonb_build_object('plan',NEW.plan,'term',NEW.term),auth.uid());
 RETURN NEW;
END; $$;
CREATE TRIGGER subscription_request_notifications AFTER INSERT ON public.subscription_requests FOR EACH ROW EXECUTE FUNCTION public.subscription_request_notify();

CREATE FUNCTION public.submit_subscription_request(_plan text,_term text,_note text DEFAULT NULL,_replace uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid; _id uuid;
BEGIN
 _org:=public.subscription_request_org();
 IF _org IS NULL THEN RAISE EXCEPTION 'Acces rezervat administratorului agenției.'; END IF;
 PERFORM 1 FROM public.organizations WHERE id=_org FOR UPDATE;
 IF _replace IS NOT NULL THEN
 UPDATE public.subscription_requests SET status='cancelled',resolved_by=auth.uid(),resolved_at=now() WHERE id=_replace AND organization_id=_org AND status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Cererea nu mai este în așteptare. Reîncarcă pagina.'; END IF;
 END IF;
 INSERT INTO public.subscription_requests(organization_id,plan,term,note,requested_by) VALUES(_org,_plan,_term,nullif(trim(_note),''),auth.uid()) RETURNING id INTO _id;
 RETURN _id;
END; $$;
CREATE FUNCTION public.cancel_subscription_request(_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid;
BEGIN
 _org:=public.subscription_request_org();
 IF _org IS NULL THEN RAISE EXCEPTION 'Acces refuzat.'; END IF;
 PERFORM 1 FROM public.organizations WHERE id=_org FOR UPDATE;
 UPDATE public.subscription_requests SET status='cancelled',resolved_by=auth.uid(),resolved_at=now() WHERE id=_request AND organization_id=_org AND status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Cererea nu mai este în așteptare.'; END IF;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,created_by) VALUES(_org,auth.uid(),'subscription.cancelled','subscription_requests',_request,auth.uid());
END; $$;

CREATE FUNCTION public.subscription_request_summary() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE _org uuid; _result jsonb;
BEGIN
 _org:=public.subscription_request_org();
 IF _org IS NULL THEN RAISE EXCEPTION 'Acces rezervat administratorului agenției.'; END IF;
 SELECT jsonb_build_object('organizationId',o.id,'organizationName',o.name,'plan',o.plan,'activeAgents',(SELECT used FROM public.org_seat_usage(o.id)),'status',o.status) INTO _result FROM public.organizations o WHERE id=_org;
 RETURN _result;
END; $$;

CREATE FUNCTION public.resolve_subscription_request(_request uuid,_status text,_starts timestamptz DEFAULT NULL,_expires timestamptz DEFAULT NULL,_reason text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _r public.subscription_requests%ROWTYPE; _org uuid; _used integer; _limit integer; _label text; _body text;
BEGIN
 IF NOT public.is_superadmin() THEN RAISE EXCEPTION 'Doar superadminul poate rezolva cererea.'; END IF;
 IF _status NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Status invalid.'; END IF;
 SELECT organization_id INTO _org FROM public.subscription_requests WHERE id=_request;
 IF _org IS NULL THEN RAISE EXCEPTION 'Cererea nu există.'; END IF;
 PERFORM 1 FROM public.organizations WHERE id=_org FOR UPDATE;
 SELECT * INTO _r FROM public.subscription_requests WHERE id=_request FOR UPDATE;
 IF _r.status<>'pending' THEN RAISE EXCEPTION 'Cererea a fost deja rezolvată.'; END IF;
 _label:=CASE _r.plan WHEN 'basic' THEN 'Basic' WHEN 'pro' THEN 'Pro' ELSE 'Unlimited' END;
 IF _status='approved' THEN
 IF _starts IS NULL OR _expires IS NULL OR _expires<=_starts THEN RAISE EXCEPTION 'Data expirării trebuie să fie după data de început.'; END IF;
 SELECT used INTO _used FROM public.org_seat_usage(_org);
 _limit:=public.plan_agent_limit(_r.plan);
 IF _limit IS NOT NULL AND _used>_limit THEN RAISE EXCEPTION 'Planul nu permite numărul actual de agenți activi.'; END IF;
 -- Reuse the existing authoritative activation/renewal logic and audit.
 PERFORM public.set_organization_subscription(_org,_r.term);
 UPDATE public.organizations SET plan=_r.plan,subscription_started_at=_starts,subscription_expires_at=_expires,status='active',suspended_reason=NULL,updated_by=auth.uid(),updated_at=now() WHERE id=_org;
 _body:='Abonamentul '||_label||' a fost activat până la '||to_char(_expires AT TIME ZONE 'Europe/Bucharest','DD.MM.YYYY');
 ELSE
 IF nullif(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'Completează motivul respingerii.'; END IF;
 _body:='Cererea de abonament '||_label||' a fost respinsă: '||trim(_reason);
 END IF;
 UPDATE public.subscription_requests SET status=_status,resolved_by=auth.uid(),resolved_at=now(),rejection_reason=CASE WHEN _status='rejected' THEN trim(_reason) ELSE NULL END WHERE id=_request;
 INSERT INTO public.notifications(organization_id,user_id,type,title,body,link,created_by)
 SELECT _org,r.user_id,'subscription_resolved',CASE WHEN _status='approved' THEN _body ELSE 'Cerere abonament respinsă' END,_body,'/abonament',auth.uid() FROM (SELECT DISTINCT user_id FROM public.user_roles WHERE organization_id=_org AND role='agency_admin') r;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,old_values,new_values,created_by)
 VALUES(_org,auth.uid(),'subscription.'||_status,'subscription_requests',_request,jsonb_build_object('status','pending'),jsonb_build_object('status',_status,'plan',_r.plan,'term',_r.term,'starts',_starts,'expires',_expires,'reason',_reason),auth.uid());
END; $$;
REVOKE ALL ON FUNCTION public.submit_subscription_request(text,text,text,uuid),public.cancel_subscription_request(uuid),public.subscription_request_summary(),public.resolve_subscription_request(uuid,text,timestamptz,timestamptz,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_subscription_request(text,text,text,uuid),public.cancel_subscription_request(uuid),public.subscription_request_summary(),public.resolve_subscription_request(uuid,text,timestamptz,timestamptz,text) TO authenticated,service_role;