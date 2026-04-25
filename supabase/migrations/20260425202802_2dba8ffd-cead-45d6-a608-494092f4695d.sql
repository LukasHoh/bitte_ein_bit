-- Fix function search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Tighten skills insert policy
DROP POLICY IF EXISTS "skills_insert_auth" ON public.skills;
CREATE POLICY "skills_insert_auth" ON public.skills
  FOR INSERT TO authenticated
  WITH CHECK (length(trim(name)) BETWEEN 1 AND 80);