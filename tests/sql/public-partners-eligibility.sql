-- Test de eligibilitate pentru lista publică de agenții partenere.
-- Rulează într-un bloc care se anulează mereu (RAISE la final): nu lasă date în urmă.
-- Rezultat așteptat: "ZZTEST Activa,ZZTEST Proba".
DO $$
DECLARE r text;
BEGIN
  INSERT INTO organizations (name, slug, status, archived_at, public_hidden_by_admin) VALUES
    ('ZZTEST Activa','zztest-1','active',null,false),('ZZTEST Proba','zztest-2','trial',null,false),
    ('ZZTEST Suspendata','zztest-3','suspended',null,false),('ZZTEST Anulata','zztest-4','cancelled',null,false),
    ('ZZTEST Arhivata','zztest-5','active',now(),false),('ZZTEST Ascunsa','zztest-6','active',null,true),
    ('ZZTEST Asteptare','zztest-7','pending_approval',null,false);
  SELECT string_agg(name, ',' ORDER BY name) INTO r FROM public.public_partner_agencies() WHERE name LIKE 'ZZTEST%';
  RAISE EXCEPTION 'REZULTAT (rollback): %', r;
END $$;
