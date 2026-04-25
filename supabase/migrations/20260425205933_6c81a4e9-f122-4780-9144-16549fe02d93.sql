
-- 1. EDUCATION LEVELS (Taxonomie)
CREATE TABLE public.education_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.education_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY edu_levels_read ON public.education_levels FOR SELECT TO authenticated USING (true);
CREATE POLICY edu_levels_admin ON public.education_levels FOR ALL TO public
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- 2. CREDENTIAL MAPPINGS (lokale Abschlüsse → Stufe)
CREATE TABLE public.credential_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  local_name TEXT NOT NULL,
  level_id UUID NOT NULL REFERENCES public.education_levels(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_code, local_name)
);
CREATE INDEX idx_credential_mappings_country ON public.credential_mappings(country_code);
ALTER TABLE public.credential_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY cred_map_read ON public.credential_mappings FOR SELECT TO authenticated USING (true);
CREATE POLICY cred_map_admin ON public.credential_mappings FOR ALL TO public
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- 3. LANGUAGES (UI-Sprachen)
CREATE TABLE public.languages (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  native_name TEXT NOT NULL,
  script TEXT NOT NULL DEFAULT 'Latn',
  direction TEXT NOT NULL DEFAULT 'ltr' CHECK (direction IN ('ltr','rtl')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.languages ENABLE ROW LEVEL SECURITY;
CREATE POLICY languages_read ON public.languages FOR SELECT TO authenticated USING (true);
CREATE POLICY languages_public_read ON public.languages FOR SELECT TO anon USING (is_active = true);
CREATE POLICY languages_admin ON public.languages FOR ALL TO public
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- 4. UI TRANSLATIONS
CREATE TABLE public.ui_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  locale TEXT NOT NULL REFERENCES public.languages(code) ON DELETE CASCADE,
  namespace TEXT NOT NULL DEFAULT 'common',
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (locale, namespace, key)
);
CREATE INDEX idx_ui_trans_locale_ns ON public.ui_translations(locale, namespace);
ALTER TABLE public.ui_translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY ui_trans_read ON public.ui_translations FOR SELECT TO authenticated USING (true);
CREATE POLICY ui_trans_public_read ON public.ui_translations FOR SELECT TO anon USING (true);
CREATE POLICY ui_trans_admin ON public.ui_translations FOR ALL TO public
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE TRIGGER ui_trans_set_updated BEFORE UPDATE ON public.ui_translations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. SECTORS
CREATE TABLE public.sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;
CREATE POLICY sectors_read ON public.sectors FOR SELECT TO authenticated USING (true);
CREATE POLICY sectors_admin ON public.sectors FOR ALL TO public
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- 6. AUTOMATION PROFILES (Country × Sector)
CREATE TABLE public.automation_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  sector_id UUID NOT NULL REFERENCES public.sectors(id) ON DELETE CASCADE,
  risk_score NUMERIC(4,3) NOT NULL CHECK (risk_score >= 0 AND risk_score <= 1),
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_code, sector_id)
);
CREATE INDEX idx_auto_profiles_country ON public.automation_profiles(country_code);
ALTER TABLE public.automation_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY auto_prof_read ON public.automation_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY auto_prof_admin ON public.automation_profiles FOR ALL TO public
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE TRIGGER auto_prof_set_updated BEFORE UPDATE ON public.automation_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. OPPORTUNITY TYPES
CREATE TABLE public.opportunity_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.opportunity_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY opp_types_read ON public.opportunity_types FOR SELECT TO authenticated USING (true);
CREATE POLICY opp_types_admin ON public.opportunity_types FOR ALL TO public
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- 8. OPPORTUNITIES (generische Tabelle, ersetzt trainings inhaltlich)
CREATE TABLE public.opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id UUID NOT NULL REFERENCES public.opportunity_types(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  provider TEXT,
  url TEXT,
  region_id UUID REFERENCES public.regions(id) ON DELETE SET NULL,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  required_level_id UUID REFERENCES public.education_levels(id) ON DELETE SET NULL,
  skills UUID[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_opp_type ON public.opportunities(type_id);
CREATE INDEX idx_opp_region ON public.opportunities(region_id);
CREATE INDEX idx_opp_sector ON public.opportunities(sector_id);
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY opp_read ON public.opportunities FOR SELECT TO authenticated USING (true);
CREATE POLICY opp_admin ON public.opportunities FOR ALL TO public
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE TRIGGER opp_set_updated BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9. SEED: opportunity_types
INSERT INTO public.opportunity_types (code, name, sort_order) VALUES
  ('formal_employment', 'Formal Employment', 10),
  ('self_employment',   'Self-Employment',   20),
  ('gig',               'Gig Work',          30),
  ('training',          'Training Pathway',  40);

-- 10. MIGRATE bestehende trainings → opportunities
INSERT INTO public.opportunities (id, type_id, title, description, provider, url, region_id, skills, created_at)
SELECT
  t.id,
  (SELECT id FROM public.opportunity_types WHERE code = 'training'),
  t.title, t.description, t.provider, t.url, t.region_id, COALESCE(t.skills, '{}'), t.created_at
FROM public.trainings t;

-- matches verweist noch auf trainings — FK temporär lösen, danach View statt Tabelle
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_training_id_fkey;
DROP TABLE public.trainings;

-- 11. trainings VIEW (rückwärtskompatibel)
CREATE VIEW public.trainings AS
SELECT o.id, o.title, o.description, o.provider, o.url, o.region_id, o.skills, o.created_at
FROM public.opportunities o
JOIN public.opportunity_types ot ON ot.id = o.type_id
WHERE ot.code = 'training';

-- matches FK auf opportunities zeigen lassen (training_id bleibt namentlich)
ALTER TABLE public.matches
  ADD CONSTRAINT matches_opportunity_id_fkey
  FOREIGN KEY (training_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;

-- 12. SEED: education_levels (ISCED)
INSERT INTO public.education_levels (code, name, sort_order) VALUES
  ('ISCED-0', 'Early childhood education', 0),
  ('ISCED-1', 'Primary education',         1),
  ('ISCED-2', 'Lower secondary',           2),
  ('ISCED-3', 'Upper secondary',           3),
  ('ISCED-4', 'Post-secondary non-tertiary', 4),
  ('ISCED-5', 'Short-cycle tertiary',      5),
  ('ISCED-6', 'Bachelor or equivalent',    6),
  ('ISCED-7', 'Master or equivalent',      7),
  ('ISCED-8', 'Doctoral or equivalent',    8);

-- 13. SEED: languages
INSERT INTO public.languages (code, name, native_name, script, direction, sort_order) VALUES
  ('de', 'German',  'Deutsch',  'Latn', 'ltr', 10),
  ('en', 'English', 'English',  'Latn', 'ltr', 20),
  ('fr', 'French',  'Français', 'Latn', 'ltr', 30),
  ('ar', 'Arabic',  'العربية',  'Arab', 'rtl', 40);

-- 14. education.level_id (optionale Verknüpfung)
ALTER TABLE public.education
  ADD COLUMN level_id UUID REFERENCES public.education_levels(id) ON DELETE SET NULL;

-- 15. profiles.locale (User-Sprachpräferenz wandert auf languages)
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_language_fk
  FOREIGN KEY (language) REFERENCES public.languages(code) ON DELETE SET NULL;
