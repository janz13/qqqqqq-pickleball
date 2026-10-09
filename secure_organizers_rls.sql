-- Secure the organizers table by revoking public access
ALTER TABLE public.organizers ENABLE ROW LEVEL SECURITY;

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Enable all for organizers" ON public.organizers;

-- Allow anon to create an organizer (registration)
CREATE POLICY "Enable insert for anon" ON public.organizers
  AS PERMISSIVE FOR INSERT
  TO anon
  WITH CHECK (true);

-- No read access for anon! Only service_role can read to verify passwords.
-- service_role inherently bypasses RLS, so we don't need a specific policy for it.
