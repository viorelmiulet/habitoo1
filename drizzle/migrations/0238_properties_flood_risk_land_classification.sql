ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS flood_risk boolean;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS land_classification text;
ALTER TABLE public.properties ADD CONSTRAINT properties_land_classification_check CHECK (land_classification IS NULL OR land_classification IN ('intravilan','extravilan'));
COMMENT ON COLUMN public.properties.flood_risk IS 'Declarație agent: zonă cu risc de inundație; NULL = nedeclarat';