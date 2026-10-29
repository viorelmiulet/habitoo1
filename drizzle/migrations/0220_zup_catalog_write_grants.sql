REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.zup_nomenclature FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.zup_nomenclature_syncs FROM anon, authenticated;
REVOKE SELECT ON public.zup_nomenclature, public.zup_nomenclature_syncs FROM anon;
GRANT SELECT ON public.zup_nomenclature, public.zup_nomenclature_syncs TO authenticated;
GRANT ALL ON public.zup_nomenclature, public.zup_nomenclature_syncs TO service_role;