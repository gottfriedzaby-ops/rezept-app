---
name: agent-memory
description: How to record and recall cross-session knowledge in MEMORY.md. Use whenever you need to remember something for future conversations, recall prior context, or when the user asks you to remember or forget something. Pairs with the native `memory:` subagent frontmatter, which provisions the directory and loads MEMORY.md automatically.
---

# Agent Memory Protocol

This skill defines *how* to use persistent memory. The native `memory:` frontmatter
field handles the mechanics: it provisions `.claude/agent-memory/<agent-name>/`,
injects the first 200 lines of `MEMORY.md` into your context at startup, and grants
Read/Write/Edit on that directory. Your job is to decide what to store and how to
structure it.

## When to read memory
- When memories seem relevant, or the user references prior-conversation work.
- Always when the user explicitly asks you to check, recall, or remember.
- If the user says to ignore memory, do not apply, cite, or mention it.

## When to write memory
Save immediately when the user asks you to remember something. Otherwise, save when
you learn something that will matter in a *future* conversation, not just this one.

## Memory types
Store each memory as one of four types:

- **user** - the user's role, goals, expertise, and collaboration preferences. Use
  these to tailor how you work with them. Avoid anything that reads as a negative
  judgement.
- **feedback** - guidance on how to approach work, from both corrections ("don't do
  X") and confirmations ("yes, that was right"). Record both: saving only corrections
  makes you drift toward over-caution. Structure as the rule, then a **Why:** line and
  a **How to apply:** line.
- **project** - ongoing work, goals, decisions, or incidents not derivable from the
  code or git history. Convert relative dates to absolute (e.g. "Thursday" ->
  "2026-03-05"). Structure as the fact, then **Why:** and **How to apply:**.
- **reference** - pointers to where information lives in external systems (issue
  trackers, dashboards, channels).

## What NOT to save
These are derivable from the repo and go stale; do not store them even if asked.
Instead, ask what was *surprising* or *non-obvious* and save only that:
- Code patterns, conventions, architecture, file paths, project structure.
- Git history or who-changed-what.
- Debugging fixes (the fix is in the code; the context is in the commit message).
- Anything already documented in CLAUDE.md.
- Ephemeral task state (use a plan or task list instead).

Never store secrets, tokens, or credentials.

## How to save (two steps)
1. Write the memory to its own file (e.g. `user_role.md`, `feedback_testing.md`) with
   frontmatter:

   ```markdown
   ---
   name: <memory name>
   description: <specific one-line description used to judge future relevance>
   type: <user | feedback | project | reference>
   ---

   <content; for feedback/project, use the rule-or-fact + Why + How to apply structure>
   ```

2. Add a one-line pointer in `MEMORY.md`: `- [Title](file.md) - one-line hook`.
   `MEMORY.md` is an index only, never the memory body. Keep it under 200 lines, since
   lines past 200 are truncated from context. Organise by topic, not chronologically.
   Check for an existing memory to update before writing a duplicate.

## Before recommending from memory
A memory naming a file, function, or flag is a claim about when it was written, not
about now. Before the user acts on it, verify: check the file exists, grep for the
symbol. A memory that summarises repo state is frozen in time; for *current* state,
prefer `git log` or reading the code. If a memory conflicts with what you observe now,
trust the observation and update or remove the stale memory.

## Memory vs other persistence
- Reaching alignment on an approach -> use a **plan**, not memory.
- Tracking steps within the current task -> use **tasks**, not memory.
- Memory is only for what survives into future conversations.

Project-scope memory is shared with the team via version control, so tailor entries to
the project rather than to a single session.
