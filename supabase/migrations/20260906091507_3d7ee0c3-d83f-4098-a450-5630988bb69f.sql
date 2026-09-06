ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS for_sale boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS for_rent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sale_price numeric,
  ADD COLUMN IF NOT EXISTS sale_currency text,
  ADD COLUMN IF NOT EXISTS rent_price numeric,
  ADD COLUMN IF NOT EXISTS rent_currency text;

UPDATE public.properties
SET for_sale = (transaction_kind = 'sale'),
    for_rent = (transaction_kind = 'rent'),
    sale_price = CASE WHEN transaction_kind = 'sale' THEN price ELSE sale_price END,
    sale_currency = CASE WHEN transaction_kind = 'sale' THEN currency ELSE sale_currency END,
    rent_price = CASE WHEN transaction_kind = 'rent' THEN price ELSE rent_price END,
    rent_currency = CASE WHEN transaction_kind = 'rent' THEN currency ELSE rent_currency END;