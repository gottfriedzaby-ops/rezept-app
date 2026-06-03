---
name: frontend-ux
description: UX-first principles for building any user-facing interface - clarity, feedback, accessibility, responsiveness, performance, and empty/loading/error states. Use when designing or reviewing UI components, pages, or flows.
---

# Frontend UX Principles

Apply these to every UI task, before and during implementation. They are
framework-agnostic.

- **Clarity** - UI elements must be understandable without documentation. If a control
  needs a manual, redesign it.
- **Feedback** - every user action gets visual feedback: loading indicators, success
  and error states, and disabled controls during async operations.
- **Accessibility** - semantic HTML, correct ARIA labels, and full keyboard navigation.
- **Responsiveness** - every component works on mobile and desktop.
- **Performance** - keep client-side interactivity minimal and its boundaries
  deliberate; render static content statically wherever the framework allows.
- **Empty states** - always design what the UI looks like with no data, not only the
  happy path with data present.

## Design order for any UI task
1. Understand the user flow - what is the user trying to accomplish?
2. Reuse existing component and naming patterns before inventing new ones.
3. Define the data shape and the component contract first.
4. Implement all four states: loading, error, empty, and success.
5. Verify responsiveness and keyboard access before considering it done.
