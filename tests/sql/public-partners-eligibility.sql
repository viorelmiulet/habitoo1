-- Test de eligibilitate pentru lista publică de agenții partenere.
-- Rulează tranzacțional; nu lasă date în urmă. Lista nu cere profil public.
BEGIN;
DO $$
DECLARE r text;
BEGIN
  INSERT INTO organizations (name, slug, status, archived_at, public_hidden_by_admin, public_profile_enabled, public_slug) VALUES
    ('ZZTEST Activa','zztest-1','active',null,false,false,'zztest-disabled'),('ZZTEST Proba','zztest-2','trial',null,false,false,null),
    ('ZZTEST Suspendata','zztest-3','suspended',null,false,true,null),('ZZTEST Anulata','zztest-4','cancelled',null,false,true,null),
    ('ZZTEST Arhivata','zztest-5','active',now(),false,true,null),('ZZTEST Ascunsa','zztest-6','active',null,true,true,null),
    ('ZZTEST Asteptare','zztest-7','pending_approval',null,false,true,null),
    ('ZZTEST Profil','zztest-8','active',null,false,true,'zztest-public');
  SELECT string_agg(name, ',' ORDER BY name) INTO r FROM public.public_partner_agencies() WHERE name LIKE 'ZZTEST%';
  IF r IS DISTINCT FROM 'ZZTEST Activa,ZZTEST Proba,ZZTEST Profil' THEN
    RAISE EXCEPTION 'Eligibilitate incorectă: %', r;
  END IF;
  IF EXISTS (SELECT 1 FROM public.public_partner_agencies() WHERE name IN ('ZZTEST Activa','ZZTEST Proba') AND public_slug IS NOT NULL) THEN
    RAISE EXCEPTION 'Profilul dezactivat nu poate avea link';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.public_partner_agencies() WHERE name = 'ZZTEST Profil' AND public_slug = 'zztest-public') THEN
    RAISE EXCEPTION 'Profilul activ trebuie să aibă link';
  END IF;
END $$;
ROLLBACK;
