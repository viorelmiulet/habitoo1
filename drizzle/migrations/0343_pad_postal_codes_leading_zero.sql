UPDATE public.ro_localities SET postal_code = '0' || postal_code WHERE postal_code ~ '^[0-9]{5}$';
UPDATE public.ro_uats SET postal_code = '0' || postal_code WHERE postal_code ~ '^[0-9]{5}$';