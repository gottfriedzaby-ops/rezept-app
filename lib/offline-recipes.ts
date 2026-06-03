import type { Recipe, RecipeType } from "@/types/recipe";

// Client-side cache of recipes the user has opened, so they can be viewed
// offline. Stored in IndexedDB (recipes can be large and exceed localStorage
// limits). Best-effort: every operation degrades gracefully if IndexedDB is
// unavailable (SSR, private mode, quota).

const DB_NAME = "rezept-app-offline";
const DB_VERSION = 1;
const STORE = "recipes";
const MAX_RECIPES = 50; // keep the most recently viewed N

export interface CachedRecipeMeta {
  id: string;
  title: string;
  image_url: string | null;
  recipe_type: RecipeType;
  cachedAt: number; // epoch ms
}

interface CachedRecord {
  id: string;
  recipe: Recipe;
  cachedAt: number;
}

function isAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Runs the callback inside a transaction and resolves once it completes.
function runTx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function getAll(db: IDBDatabase): Promise<CachedRecord[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as CachedRecord[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

// Drop the oldest records once the cache exceeds MAX_RECIPES.
async function pruneToLimit(db: IDBDatabase): Promise<void> {
  const all = await getAll(db);
  if (all.length <= MAX_RECIPES) return;
  const toDelete = all
    .sort((a, b) => b.cachedAt - a.cachedAt)
    .slice(MAX_RECIPES)
    .map((r) => r.id);
  await runTx(db, "readwrite", (store) => {
    toDelete.forEach((id) => store.delete(id));
  });
}

export async function cacheRecipe(recipe: Recipe): Promise<void> {
  if (!isAvailable()) return;
  try {
    const db = await openDb();
    const record: CachedRecord = { id: recipe.id, recipe, cachedAt: Date.now() };
    await runTx(db, "readwrite", (store) => store.put(record));
    await pruneToLimit(db);
    db.close();
  } catch {
    // best-effort
  }
}

export async function getCachedRecipe(id: string): Promise<Recipe | null> {
  if (!isAvailable()) return null;
  try {
    const db = await openDb();
    const record = await new Promise<CachedRecord | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result as CachedRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return record?.recipe ?? null;
  } catch {
    return null;
  }
}

export async function getCachedRecipes(): Promise<CachedRecipeMeta[]> {
  if (!isAvailable()) return [];
  try {
    const db = await openDb();
    const all = await getAll(db);
    db.close();
    return all
      .sort((a, b) => b.cachedAt - a.cachedAt)
      .map(({ recipe, cachedAt }) => ({
        id: recipe.id,
        title: recipe.title,
        image_url: recipe.image_url,
        recipe_type: recipe.recipe_type ?? "kochen",
        cachedAt,
      }));
  } catch {
    return [];
  }
}
