#!/bin/bash
# PostToolUse hook: run Jest when a .ts/.tsx file is written or edited.
input=$(cat)

# Extract file_path from tool_input (works for both Write and Edit tools)
file_path=$(echo "$input" | python3 -c \
  "import sys, json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" \
  2>/dev/null)

# Only trigger for TypeScript files
if [[ "$file_path" =~ \.(tsx?)$ ]]; then
  echo "🧪 TypeScript file changed — running npm test..."
  cd /home/user/rezept-app && npm test 2>&1
fi
