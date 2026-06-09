#!/bin/bash
# TaskCompleted hook: run the Jest suite when a task is marked complete, but
# only if TypeScript files were touched during it.
#
# This was previously a PostToolUse hook that fired after every Write/Edit of a
# .ts/.tsx file. It now runs on the TaskCompleted event so the suite executes
# when a task finishes rather than after each individual edit.
#
# The TaskCompleted payload carries no tool_input.file_path, so rather than
# inspecting a single edited file we check the working tree for staged or
# unstaged .ts/.tsx changes. The git pathspec '*.ts'/'*.tsx' matches files in
# nested directories and also catches untracked (newly written) test files.

# Consume the hook payload from stdin so the pipe closes cleanly (unused here).
cat >/dev/null

cd /home/user/rezept-app || exit 0

changed_ts=$(git status --porcelain -- '*.ts' '*.tsx' 2>/dev/null)

if [ -n "$changed_ts" ]; then
  echo "🧪 TypeScript files changed this task — running npm test..."
  npm test 2>&1
else
  echo "✅ No TypeScript changes this task — skipping npm test."
fi

# Always exit 0: surface results without blocking task completion.
exit 0
