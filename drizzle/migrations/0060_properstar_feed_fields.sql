-- Properstar cere cod poștal pentru fiecare anunț și pentru biroul agenției.
-- Nu inventăm valori: câmpurile sunt opționale, iar ofertele fără cod poștal
-- sunt excluse din feed și raportate în UI ca „de completat".
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS postal_code text;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS postal_code text;

-- Momentul retragerii de pe portal: feedul Properstar trebuie să păstreze
-- oferta retrasă 7 zile cu Status=Deleted, apoi să o scoată definitiv.
ALTER TABLE public.portal_publications ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;

CREATE INDEX IF NOT EXISTS portal_publications_withdrawn_idx
  ON public.portal_publications (organization_id, portal_key, withdrawn_at);
