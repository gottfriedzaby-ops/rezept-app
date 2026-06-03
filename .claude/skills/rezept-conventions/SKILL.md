---
name: rezept-conventions
description: Code conventions for the Rezept-App frontend - TypeScript strict mode, functional components with named Props interfaces, Tailwind-only styling, German UI text with English identifiers, and mandatory loading/error/empty states. Use when writing or reviewing .ts/.tsx files in this project.
---

# Rezept-App Frontend Conventions

Stack: Next.js 14 (App Router, TypeScript strict mode), Tailwind CSS, Supabase
backend. UI text is German; code, variable, and function names are English.

Relevant paths:
- `/app/(recipes)` - recipe pages (list, detail, cook mode)
- `/components` - reusable UI components
- `/types` - shared TypeScript types (Recipe, Ingredient, etc.)
- `/lib` - client-side utilities only

## Rules
1. **TypeScript strict, no `any`.** If a type is unknown, use `unknown` and narrow it.
   Use proper generics, unions, and interfaces.
2. **Functional components only**, with an explicit, named Props interface:

   ```typescript
   interface RecipeCardProps {
     title: string;
     prepTime: number;
     tags: string[];
   }

   export function RecipeCard({ title, prepTime, tags }: RecipeCardProps) {
     // ...
   }
   ```
3. **German UI text, English identifiers.** All user-visible strings are German.
4. **Tailwind for all styling** - no inline styles, no CSS modules unless already present.
5. **Handle every state in the UI** - loading, error, and empty are never left without
   user feedback.
6. **`'use client'` deliberately** - add it only to components that need interactivity,
   and keep the boundary as low in the tree as possible.

## Before delivering
Reuse existing component structures and naming. Define the Props interface before the
implementation. For a full pre-delivery audit, run the `review-frontend` skill.
