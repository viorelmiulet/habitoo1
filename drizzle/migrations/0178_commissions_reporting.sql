ALTER TABLE public.commissions ADD COLUMN ron_to_eur_rate numeric(12,6);
COMMENT ON COLUMN public.commissions.ron_to_eur_rate IS 'Cursul BNR RON/EUR din ziua tranzacției, folosit la conversia în EUR a rapoartelor; păstrat ca rapoartele vechi să nu se schimbe.';

CREATE TABLE public.exchange_rates (
  day date PRIMARY KEY,
  eur_ron numeric(12,6) NOT NULL CHECK (eur_ron > 0)
);
COMMENT ON TABLE public.exchange_rates IS 'Cursuri BNR zilnice (RON pentru 1 EUR), cache local; populate la cerere de server.';

GRANT SELECT ON public.exchange_rates TO authenticated;
GRANT ALL ON public.exchange_rates TO service_role;
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Exchange rates read" ON public.exchange_rates FOR SELECT TO authenticated USING (true);