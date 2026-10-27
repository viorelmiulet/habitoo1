ALTER TABLE public.contacts ADD COLUMN gdpr_consent_at timestamptz, ADD COLUMN gdpr_consent_by uuid, ADD COLUMN gdpr_consent_method text, ADD COLUMN gdpr_withdrawn_at timestamptz, ADD COLUMN gdpr_consent_history jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE OR REPLACE FUNCTION public.contact_source_label(_source text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT CASE lower(trim(_source)) WHEN 'storia' THEN 'Storia' WHEN 'imobiliare' THEN 'Imobiliare.ro' WHEN 'imobiliare.ro' THEN 'Imobiliare.ro' WHEN 'olx' THEN 'OLX' WHEN 'facebook' THEN 'Facebook' WHEN 'map' THEN 'Anunțuri particulari (MAP)' WHEN 'private_listing' THEN 'Anunțuri particulari (MAP)' WHEN 'site' THEN 'Site-ul agenției' WHEN 'website' THEN 'Site-ul agenției' WHEN 'referral' THEN 'Recomandare' WHEN 'phone' THEN 'Telefon' WHEN 'office' THEN 'Vizită la birou' WHEN 'collaboration' THEN 'Colaborare' ELSE nullif(trim(_source),'') END $$;
CREATE OR REPLACE FUNCTION public.contacts_consent_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE changed boolean; actor uuid; stamp timestamptz := clock_timestamp();
BEGIN
 NEW.source := public.contact_source_label(NEW.source);
 IF length(NEW.source)>200 THEN RAISE EXCEPTION 'Sursa poate avea maximum 200 de caractere.'; END IF;
 actor := auth.uid();
 IF TG_OP='INSERT' THEN
  changed := coalesce(NEW.gdpr_consent,false);
  NEW.gdpr_consent_at := NULL; NEW.gdpr_consent_by := NULL; NEW.gdpr_withdrawn_at := NULL; NEW.gdpr_consent_history := '[]'::jsonb;
 ELSE
  changed := coalesce(NEW.gdpr_consent,false) IS DISTINCT FROM coalesce(OLD.gdpr_consent,false);
  NEW.gdpr_consent_at := OLD.gdpr_consent_at; NEW.gdpr_consent_by := OLD.gdpr_consent_by; NEW.gdpr_withdrawn_at := OLD.gdpr_withdrawn_at; NEW.gdpr_consent_history := OLD.gdpr_consent_history;
  IF NOT changed THEN NEW.gdpr_consent_method := OLD.gdpr_consent_method; END IF;
 END IF;
 IF changed THEN
  IF actor IS NULL THEN RAISE EXCEPTION 'Înregistrarea acordului necesită un agent autentificat.'; END IF;
  IF NEW.gdpr_consent THEN
   IF NEW.gdpr_consent_method IS NULL OR NEW.gdpr_consent_method NOT IN ('verbal','scris','email','formular pe site') THEN RAISE EXCEPTION 'Alege modul în care clientul și-a dat acordul.'; END IF;
   NEW.gdpr_consent_at := stamp; NEW.gdpr_consent_by := actor; NEW.gdpr_withdrawn_at := NULL;
   NEW.gdpr_consent_history := NEW.gdpr_consent_history || jsonb_build_array(jsonb_build_object('action','granted','at',stamp,'agent_id',actor,'method',NEW.gdpr_consent_method));
  ELSE
   NEW.gdpr_consent_method := OLD.gdpr_consent_method; NEW.gdpr_withdrawn_at := stamp;
   NEW.gdpr_consent_history := NEW.gdpr_consent_history || jsonb_build_array(jsonb_build_object('action','withdrawn','at',stamp,'agent_id',actor,'method',OLD.gdpr_consent_method));
  END IF;
 ELSIF TG_OP='INSERT' THEN NEW.gdpr_consent_method := NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER contacts_consent_guard BEFORE INSERT OR UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.contacts_consent_guard();
CREATE OR REPLACE FUNCTION public.lead_contact_source_fill() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.contact_id IS NOT NULL AND nullif(trim(NEW.source),'') IS NOT NULL THEN
 UPDATE public.contacts SET source=public.contact_source_label(NEW.source) WHERE id=NEW.contact_id AND organization_id=NEW.organization_id AND nullif(trim(source),'') IS NULL;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER lead_contact_source_fill AFTER INSERT OR UPDATE OF contact_id,source ON public.leads FOR EACH ROW EXECUTE FUNCTION public.lead_contact_source_fill();