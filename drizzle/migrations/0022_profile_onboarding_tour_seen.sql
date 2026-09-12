ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_tour_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.onboarding_tour_seen_at IS
  'Momentul în care utilizatorul a terminat sau a sărit turul ghidat; NULL = turul pornește automat o singură dată.';