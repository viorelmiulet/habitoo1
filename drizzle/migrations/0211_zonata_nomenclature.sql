CREATE TABLE public.zonata_subcategories (
  category_slug text NOT NULL,
  category_label text,
  subcategory_slug text NOT NULL,
  subcategory_label text,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  synced_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (category_slug, subcategory_slug)
);
GRANT SELECT ON public.zonata_subcategories TO authenticated;
GRANT ALL ON public.zonata_subcategories TO service_role;
ALTER TABLE public.zonata_subcategories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin reads zonata subcategories" ON public.zonata_subcategories
  FOR SELECT TO authenticated USING (public.is_superadmin());

CREATE TABLE public.zonata_nomenclature_syncs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  synced_at timestamptz NOT NULL DEFAULT now(),
  synced_by uuid,
  organization_id uuid,
  raw_categories jsonb,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.zonata_nomenclature_syncs TO authenticated;
GRANT ALL ON public.zonata_nomenclature_syncs TO service_role;
ALTER TABLE public.zonata_nomenclature_syncs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "superadmin reads zonata syncs" ON public.zonata_nomenclature_syncs
  FOR SELECT TO authenticated USING (public.is_superadmin());