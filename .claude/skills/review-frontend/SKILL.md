---
name: review-frontend
description: Pre-delivery self-review checklist for Rezept-App frontend changes. Invoke with /review-frontend to audit recently written .ts/.tsx code for scope, type safety, state handling, German UI, and responsiveness.
invocation: user
agent: nextjs-frontend-dev
---

# Frontend Review

Review the recently changed frontend files (not the whole codebase) against this
checklist. Report each item as pass or fail with a one-line note, then fix the
failures that fall within frontend scope.

- [ ] Only `.ts` / `.tsx` frontend files were modified (no API routes, no Supabase
      server code, no config, no assets).
- [ ] No `any` types introduced; any `unknown` is narrowed where used.
- [ ] Every component has an explicit, named Props interface.
- [ ] Loading, error, and empty states are all handled in the UI.
- [ ] All user-visible text is German; identifiers are English.
- [ ] Tailwind is used for all styling (no inline styles or stray CSS modules).
- [ ] Components are responsive (mobile and desktop).
- [ ] Keyboard navigation and ARIA labels are present where relevant.

If any change touched a backend file, flag it and describe what a backend developer
needs to do - do not edit backend files here.
