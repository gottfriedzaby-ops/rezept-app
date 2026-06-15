-- Feature 19 — shared common-food nutrition cache (manual diary lookup).
--
-- Backs the calorie tracker's manual "Nachschlagen" button
-- (components/nutrition/AddFoodDialog.tsx + app/api/nutrition/food-lookup).
-- When a user types a food name that the static seed below does not cover, the
-- food-lookup route asks Claude (haiku) once and UPSERTS the result here — so
-- every user benefits from that single lookup and Claude is never asked again
-- for the same name.
--
-- Values are stored PER SERVING (to match food_log_entries.kcal_per_serving and
-- the rest of Feature 19). serving_desc carries the human portion context.
--
-- Names are stored NORMALIZED (trimmed, whitespace-collapsed, trailing
-- punctuation stripped, lowercased — umlauts preserved) to match
-- lib/ingredient-categories.ts#normalizeIngredientName, the single normalizer
-- used on both the seed keys and the lookup path.
--
-- Access: this is global data. Writes happen only via the service-role API
-- route; RLS is enabled with NO policies, so anon/authenticated clients cannot
-- read or write it directly — they go through /api/nutrition/food-lookup.
--
-- Prerequisite: set_updated_at() exists (profiles migration).

CREATE TABLE IF NOT EXISTS food_database (
  name              text        PRIMARY KEY,                 -- normalized lookup key
  display_name      text        NOT NULL,                    -- cased name for display
  kcal_per_serving  numeric     NOT NULL DEFAULT 0 CHECK (kcal_per_serving >= 0),
  protein_g         numeric     NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
  carbs_g           numeric     NOT NULL DEFAULT 0 CHECK (carbs_g >= 0),
  fat_g             numeric     NOT NULL DEFAULT 0 CHECK (fat_g >= 0),
  serving_desc      text,                                    -- e.g. "1 Portion (ca. 150 g)"
  source            text        NOT NULL DEFAULT 'llm' CHECK (source IN ('seed', 'llm')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS food_database_source_idx ON food_database (source);

DROP TRIGGER IF EXISTS food_database_updated_at ON food_database;
CREATE TRIGGER food_database_updated_at
  BEFORE UPDATE ON food_database
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE food_database ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: only the service role (server) touches this table.

-- ─── Seed: common foods (keys pre-normalized: lowercase, single-spaced, umlauts kept) ───
INSERT INTO food_database (name, display_name, kcal_per_serving, protein_g, carbs_g, fat_g, serving_desc, source) VALUES
  ('apfel',               'Apfel',               95,  0,  25, 0,  '1 mittelgroßer Apfel (ca. 180 g)', 'seed'),
  ('banane',              'Banane',              105, 1,  27, 0,  '1 Banane (ca. 120 g)',             'seed'),
  ('ei',                  'Ei',                  78,  6,  1,  5,  '1 großes Ei (ca. 60 g)',           'seed'),
  ('vollkornbrot',        'Vollkornbrot',        120, 5,  20, 2,  '1 Scheibe (ca. 50 g)',             'seed'),
  ('brötchen',            'Brötchen',            140, 5,  27, 1,  '1 Brötchen (ca. 50 g)',            'seed'),
  ('butter',              'Butter',              75,  0,  0,  8,  '1 EL (ca. 10 g)',                  'seed'),
  ('milch',               'Milch',               122, 7,  10, 5,  '1 Glas (ca. 250 ml, 3,5 %)',       'seed'),
  ('joghurt natur',       'Joghurt natur',       90,  5,  7,  4,  '1 Becher (ca. 150 g)',             'seed'),
  ('quark mager',         'Quark mager',         67,  12, 4,  0,  '1 Portion (ca. 100 g)',            'seed'),
  ('hüttenkäse',          'Hüttenkäse',          98,  11, 3,  4,  '1 Portion (ca. 100 g)',            'seed'),
  ('gouda',               'Gouda',               101, 7,  1,  8,  '1 Scheibe (ca. 30 g)',             'seed'),
  ('haferflocken',        'Haferflocken',        150, 5,  27, 3,  '1 Portion (ca. 40 g)',             'seed'),
  ('reis gekocht',        'Reis gekocht',        205, 4,  45, 0,  '1 Portion (ca. 150 g)',            'seed'),
  ('nudeln gekocht',      'Nudeln gekocht',      220, 8,  43, 1,  '1 Portion (ca. 150 g)',            'seed'),
  ('kartoffeln gekocht',  'Kartoffeln gekocht',  130, 3,  30, 0,  '1 Portion (ca. 150 g)',            'seed'),
  ('hähnchenbrust',       'Hähnchenbrust',       165, 31, 0,  4,  '1 Portion (ca. 100 g)',            'seed'),
  ('rinderhackfleisch',   'Rinderhackfleisch',   250, 26, 0,  17, '1 Portion (ca. 100 g)',            'seed'),
  ('lachs',               'Lachs',               208, 20, 0,  13, '1 Filet (ca. 100 g)',              'seed'),
  ('thunfisch in wasser', 'Thunfisch in Wasser', 116, 26, 0,  1,  '1 Dose abgetropft (ca. 100 g)',    'seed'),
  ('tomate',              'Tomate',              22,  1,  5,  0,  '1 Tomate (ca. 120 g)',             'seed'),
  ('gurke',               'Gurke',               16,  1,  4,  0,  '1 Portion (ca. 100 g)',            'seed'),
  ('möhre',               'Möhre',               41,  1,  10, 0,  '1 Möhre (ca. 100 g)',              'seed'),
  ('avocado',             'Avocado',             240, 3,  13, 22, '1 halbe Avocado (ca. 100 g)',      'seed'),
  ('mandeln',             'Mandeln',             173, 6,  6,  15, '1 Handvoll (ca. 30 g)',            'seed'),
  ('olivenöl',            'Olivenöl',            119, 0,  0,  14, '1 EL (ca. 14 g)',                  'seed'),
  ('apfelsaft',           'Apfelsaft',           115, 0,  28, 0,  '1 Glas (ca. 250 ml)',              'seed'),
  ('cola',                'Cola',                105, 0,  27, 0,  '1 Glas (ca. 250 ml)',              'seed'),
  ('kaffee schwarz',      'Kaffee schwarz',      2,   0,  0,  0,  '1 Tasse (ca. 200 ml)',             'seed'),
  ('bier',                'Bier',                210, 2,  17, 0,  '1 Glas (ca. 500 ml)',              'seed'),
  ('pizza margherita',    'Pizza Margherita',    800, 30, 90, 30, '1 Pizza (ca. 300 g)',              'seed'),
  ('spaghetti bolognese', 'Spaghetti Bolognese', 600, 28, 70, 22, '1 Portion (ca. 400 g)',            'seed'),
  ('pommes frites',       'Pommes frites',       312, 4,  41, 15, '1 Portion (ca. 150 g)',            'seed'),
  ('croissant',           'Croissant',           230, 5,  26, 12, '1 Croissant (ca. 60 g)',           'seed')
ON CONFLICT (name) DO NOTHING;
