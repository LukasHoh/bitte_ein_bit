-- Add additional UI/profile languages
INSERT INTO public.languages (code, name, native_name, script, direction, sort_order)
VALUES
  ('es', 'Spanish', 'Español', 'Latn', 'ltr', 50),
  ('it', 'Italian', 'Italiano', 'Latn', 'ltr', 60),
  ('pt', 'Portuguese', 'Português', 'Latn', 'ltr', 70),
  ('nl', 'Dutch', 'Nederlands', 'Latn', 'ltr', 80),
  ('pl', 'Polish', 'Polski', 'Latn', 'ltr', 90),
  ('tr', 'Turkish', 'Türkçe', 'Latn', 'ltr', 100),
  ('hi', 'Hindi', 'हिन्दी', 'Deva', 'ltr', 110),
  ('ur', 'Urdu', 'اردو', 'Arab', 'rtl', 120),
  ('bn', 'Bengali', 'বাংলা', 'Beng', 'ltr', 130),
  ('sw', 'Swahili', 'Kiswahili', 'Latn', 'ltr', 140),
  ('uk', 'Ukrainian', 'Українська', 'Cyrl', 'ltr', 150),
  ('ru', 'Russian', 'Русский', 'Cyrl', 'ltr', 160),
  ('zh', 'Chinese', '中文', 'Hans', 'ltr', 170),
  ('ja', 'Japanese', '日本語', 'Jpan', 'ltr', 180),
  ('ko', 'Korean', '한국어', 'Kore', 'ltr', 190)
ON CONFLICT (code) DO NOTHING;

