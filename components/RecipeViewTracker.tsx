"use client";

import { useEffect } from "react";
import { useAnalytics } from "@/contexts/AnalyticsContext";
import type { RecipeType, SourceType } from "@/types/recipe";

interface Props {
  recipeId: string;
  sourceType?: SourceType;
  recipeType?: RecipeType;
  isOwner: boolean;
}

export default function RecipeViewTracker({ recipeId, sourceType, recipeType, isOwner }: Props) {
  const { track } = useAnalytics();
  useEffect(() => {
    track("recipe_viewed", {
      recipe_id: recipeId,
      source_type: sourceType,
      recipe_type: recipeType,
      is_owner: isOwner,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId]);
  return null;
}
