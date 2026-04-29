# Feature 07 — Shopping List

**Einkaufsliste aus Rezeptzutaten erstellen**

| Field | Value |
|---|---|
| Status | Draft |
| Effort | **M** (localStorage) / **M+** (server-side) |
| Priority | Medium |
| Dependencies | Feature 05 (Auth) — for server-side persistence only |

---

## 1. Overview

Users frequently cook from multiple recipes and need a consolidated grocery list. This feature lets users add scaled ingredient lists from one or more recipes to a persistent shopping list.

The shopping list is interactive: users can check off items as they shop, remove individual items, and clear the whole list. Ingredient amounts are scaled proportionally to the desired serving count before being added.

**Goal:** Eliminate the need for a separate notes app or paper list during grocery shopping.

---

## 2. User Stories

### US-07-1 — Add all ingredients from a recipe to the shopping list
> Als Nutzer möchte ich auf der Rezeptdetailseite auf "Zur Einkaufsliste hinzufügen" tippen und alle Zutaten des Rezepts auf meine Einkaufsliste setzen, damit ich sofort weiß, was ich im Supermarkt kaufen muss.

**Acceptance criteria:**
- "Zur Einkaufsliste hinzufügen" button on the recipe detail page.
- All ingredients are added to the shopping list after confirmation.
- A success toast is shown: "X Zutaten zur Einkaufsliste hinzugefügt."

---

### US-07-2 — Scale ingredients to the desired serving count
> Als Nutzer möchte ich vor dem Hinzufügen wählen können, für wie viele Portionen ich einkaufen möchte, damit die Mengenangaben automatisch angepasst werden.

**Acceptance criteria:**
- A serving count selector appears when "Zur Einkaufsliste hinzufügen" is tapped (modal or inline).
- Default: the recipe's own `servings` value.
- Amounts are scaled proportionally: `new_amount = ingredient.amount * (desired_servings / recipe.servings)`.
- Fractional amounts are rounded to a sensible precision (e.g. 1 decimal place).

---

### US-07-3 — View the shopping list
> Als Nutzer möchte ich eine übersichtliche Einkaufsliste sehen, auf der alle Zutaten mit Menge, Einheit und Name aufgelistet sind, damit ich im Laden nichts vergesse.

**Acceptance criteria:**
- Dedicated shopping list page or slide-over panel (accessible from main navigation).
- Items displayed as: `{amount} {unit} {name}`.
- Items grouped by source recipe (see OQ-07-3 for merging option).

---

### US-07-4 — Check off items while shopping
> Als Nutzer möchte ich Zutaten in der Einkaufsliste abhaken können, sobald ich sie im Laden gefunden habe, damit ich nicht zweimal durch die Liste scrollen muss.

**Acceptance criteria:**
- Tapping an item toggles its checked state.
- Checked items are visually struck through (line-through text style).
- Checked state persists across sessions.
- Option to hide already-checked items (toggle: "Erledigte ausblenden").

---

### US-07-5 — Remove individual items
> Als Nutzer möchte ich einzelne Zutaten aus der Einkaufsliste entfernen können, falls ich sie schon zu Hause habe, damit meine Liste nur wirklich benötigte Artikel enthält.

**Acceptance criteria:**
- Swipe-to-delete (mobile) or a delete icon per item.
- Removed items disappear immediately.
- No confirmation required for single item removal.

---

### US-07-6 — Add ingredients from multiple recipes
> Als Nutzer möchte ich Zutaten aus mehreren Rezepten in dieselbe Einkaufsliste aufnehmen können, damit ich für ein ganzes Menü auf einmal einkaufen kann.

**Acceptance criteria:**
- "Zur Einkaufsliste hinzufügen" on a second recipe appends to the existing list (does not replace it).
- Items from different recipes are either grouped by recipe or merged by ingredient name (see OQ-07-3).

---

### US-07-7 — Clear the entire shopping list
> Als Nutzer möchte ich die komplette Einkaufsliste auf einmal löschen können, damit ich nach dem Einkauf mit einer leeren Liste starten kann.

**Acceptance criteria:**
- "Liste leeren" button with a confirmation dialog: "Möchtest du wirklich alle X Einträge löschen?"
- After confirmation, the list is cleared completely.

---

## 3. Functional Requirements

### FR-07-1 — Serving count selector
When the user taps "Zur Einkaufsliste hinzufügen", a selector MUST be shown allowing the user to set the desired serving count. The selector MUST:
- Default to the recipe's `servings` value.
- Allow values from 1 to 20 (or a reasonable max — see OQ-07-1).
- Show a real-time preview of the scaled first ingredient to confirm the math is correct.

### FR-07-2 — Amount scaling
Ingredient amounts MUST be scaled as:
```
scaled_amount = round(ingredient.amount * (desired_servings / recipe.servings), 1)
```
Ingredients with `amount = null` or `unit = ""` (e.g. "1 Prise Salz") MUST be added unscaled with the original text preserved.

### FR-07-3 — Shopping list persistence
The shopping list MUST persist across browser sessions. Two implementation tiers:

**Tier 1 — localStorage (no auth required):**
- List stored in `localStorage` under key `rezept-app:shopping-list`.
- Works completely offline.
- Data is device-local; not synced across devices.
- Implement this first.

**Tier 2 — Server-side (requires Feature 05 — Auth):**
- List stored in Supabase (`shopping_list_items` table, see Data Model Impact).
- Synced across devices for logged-in users.
- Offline fallback: write to localStorage, sync on reconnect.
- Implement after Feature 05 is deployed.

### FR-07-4 — Item display format
Each shopping list item MUST be displayed as: `{scaled_amount} {unit} {name}`.
- If `amount` is null: display only `{unit} {name}` or just `{name}`.
- Items are sorted: unchecked items first, checked items last.

### FR-07-5 — Check/uncheck
Tapping an item MUST toggle a `checked: boolean` property. Visual treatment: checked items show line-through text and reduced opacity.

### FR-07-6 — Hide checked items
A toggle "Erledigte ausblenden" MUST filter out checked items from the visible list. The toggle state MUST persist in localStorage.

### FR-07-7 — Remove individual items
Each item MUST have a delete affordance (delete icon or swipe gesture). Deletion MUST take effect immediately without a confirmation dialog.

### FR-07-8 — "Liste leeren" with confirmation
A "Liste leeren" button MUST be available at the top or bottom of the shopping list. Tapping it MUST show a confirmation dialog before clearing. Confirmation text: "Alle {count} Einträge löschen?"

### FR-07-9 — Navigation access
The shopping list MUST be accessible from the main navigation (e.g. a shopping cart icon in the header/bottom nav). The icon SHOULD show a badge with the count of unchecked items when the list is non-empty.

### FR-07-10 — Multi-section recipe compatibility
If Feature 03 (Multi-Section Recipes) is deployed, "Zur Einkaufsliste hinzufügen" MUST add ingredients from **all sections** of the recipe. Optionally, allow adding ingredients from a single section only (see OQ-07-4).

---

## 4. Non-Functional Requirements

### NFR-07-1 — Offline support (localStorage tier)
The localStorage implementation MUST work completely offline (no network required). This is the primary offline use case: user has the app open while shopping in a store with no connectivity.

### NFR-07-2 — Sync on reconnect (server-side tier)
When server-side persistence is implemented, the app MUST attempt to sync any localStorage changes to the server when the user comes back online. Conflict resolution strategy: last-write-wins for check state; manual resolution for item additions.

### NFR-07-3 — Performance
The shopping list page MUST render within 200ms of navigation. For localStorage, this means no async reads on initial render — read synchronously during hydration.

### NFR-07-4 — Accessibility
Checkboxes MUST be keyboard-accessible and MUST have appropriate ARIA labels. The delete button MUST have `aria-label="Zutat entfernen"`.

---

## 5. Data Model Impact

### localStorage schema (Tier 1)

```ts
interface ShoppingListItem {
  id: string;            // uuid v4 generated client-side
  recipe_id: string;
  recipe_title: string;
  ingredient_name: string;
  amount: number | null;
  unit: string;
  checked: boolean;
  added_at: string;      // ISO 8601
}

type ShoppingList = ShoppingListItem[];
// Stored in localStorage as JSON string
```

### Server-side schema (Tier 2 — requires Feature 05)

```sql
CREATE TABLE shopping_lists (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id)  -- one list per user (for simplicity)
);

CREATE TABLE shopping_list_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id         uuid NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  recipe_id       uuid REFERENCES recipes(id) ON DELETE SET NULL,
  recipe_title    text,
  ingredient_name text NOT NULL,
  amount          numeric,
  unit            text,
  checked         boolean NOT NULL DEFAULT false,
  added_at        timestamptz DEFAULT now()
);

CREATE INDEX shopping_list_items_list_id_idx ON shopping_list_items (list_id);

-- RLS
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_lists" ON shopping_lists
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "owner_all_items" ON shopping_list_items
  FOR ALL USING (
    list_id IN (SELECT id FROM shopping_lists WHERE user_id = auth.uid())
  );
```

---

## 6. Open Questions

| # | Question | Impact | Owner |
|---|---|---|---|
| OQ-07-1 | What is the maximum serving count in the selector? 20 seems reasonable — confirm | FR-07-1 | Product |
| OQ-07-2 | Should the server-side implementation be in scope simultaneously with localStorage, or strictly as a follow-up after Feature 05? | Sprint planning | Product |
| OQ-07-3 | Should identical ingredients from different recipes be merged into one line item (e.g. "200g Mehl" + "300g Mehl" → "500g Mehl")? Merging is UX-friendly but technically complex (unit normalization, name matching) | Data model, UX | Product + Engineering |
| OQ-07-4 | For multi-section recipes (Feature 03): should users be able to add ingredients from a single section only? | UX for Feature 03 integration | Product |
| OQ-07-5 | Should users be able to share their shopping list with others (e.g. a partner)? | Scope expansion — out of scope v1 | Product |
| OQ-07-6 | Should the list support manual item entry (not from a recipe)? | Scope | Product |

---

## 7. Decisions

| ID | Question | Decision | Rationale |
|----|----------|----------|-----------|
| OQ-07-1 | Max serving count | **20** confirmed | Far beyond any home cooking need |
| OQ-07-2 | Server-side persistence timing | **Strictly after Feature 05 (Auth)** | localStorage sufficient for single user; no point syncing without auth |
| OQ-07-3 | Merge identical ingredients? | **No — group by recipe** | Unit normalization + name matching is complex; grouped list is simpler and equally useful |
| OQ-07-4 | Add from single section only? | **No — always add all sections at once** | Section picker adds UI complexity; users can remove items post-add |
| OQ-07-5 | Share shopping list? | **Out of scope permanently** | Requires auth + per-list tokens; belongs in a collaborative cooking app |
| OQ-07-6 | Manual item entry? | **Yes** — free-text input at bottom of list | Users need non-recipe items ("Kaffee", "Waschpulver"); without it the list can never replace a notes app |

---

## 8. Effort Estimate

| Tier | Tasks | Estimate |
|---|---|---|
| **Tier 1: localStorage** | Serving selector + scaling logic, localStorage store, shopping list page, check/uncheck, hide-checked toggle, remove item, clear all, nav badge | **M (~18–22h)** |
| **Tier 2: Server-side** (additional, after Feature 05) | DB tables + RLS, Supabase CRUD hooks, offline sync on reconnect, conflict resolution | **M+ (~12–16h additional)** |

---

*Feature 07 of 8 — see [README.md](./README.md) for full index*
