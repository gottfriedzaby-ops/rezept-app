-- Shared, cross-user ingredient → supermarket-aisle categorizations.
--
-- Backs the shopping list "by type" view (lib/ingredient-categories.ts +
-- app/api/shopping/categorize). When an ingredient is not covered by the static
-- keyword map, the categorize route asks Claude once and UPSERTS the result
-- here — so every user benefits from that single lookup and Claude is never
-- asked again for the same name. Names are stored normalized (trimmed,
-- whitespace-collapsed, trailing punctuation stripped, lowercased) to match
-- lib/ingredient-categories.ts#normalizeIngredientName.
--
-- Access: this is global data. Writes happen only via the service-role API
-- route; RLS is enabled with NO policies, so anon/authenticated clients cannot
-- read or write it directly — they go through /api/shopping/categorize.

create table if not exists ingredient_categories (
  name        text primary key,            -- normalized ingredient name
  category    text not null check (category in (
                'obst-gemuese','molkerei-eier','fleisch-fisch','brot-backwaren',
                'tiefkuehl','vorrat','gewuerze-saucen','getraenke',
                'suesses-snacks','sonstiges'
              )),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table ingredient_categories enable row level security;
-- Intentionally no policies: only the service role (server) touches this table.
