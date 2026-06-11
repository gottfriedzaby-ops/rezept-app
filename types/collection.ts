export interface Collection {
  id: string;
  created_at: string;
  user_id: string;
  name: string;
}

export interface CollectionWithCount extends Collection {
  recipe_count: number;
}
