#!/usr/bin/env bash

set -euo pipefail

TOP_LEVEL="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
PROJECT_FILE="${1:-$TOP_LEVEL/mobile/ios/Agentrix.xcodeproj/project.pbxproj}"

if [[ ! -f "$PROJECT_FILE" ]]; then
  echo "Project file not found: $PROJECT_FILE" >&2
  exit 1
fi

python3 - <<'PY' "$PROJECT_FILE"
import sys
from pathlib import Path

project = Path(sys.argv[1])
lines = project.read_text().splitlines()

blocks = []
current = []
inside = False

for line in lines:
    stripped = line.strip()
    if stripped.startswith("buildSettings = {"):
        inside = True
        current = []
        continue
    if inside and stripped == "};":
        blocks.append("\n".join(current))
        inside = False
        continue
    if inside:
        current.append(stripped)

checked = 0
missing = []

for block in blocks:
    if "PRODUCT_BUNDLE_IDENTIFIER = me.simonskinner.agentrix.watch;" not in block:
        continue
    checked += 1
    if "SKIP_INSTALL = YES;" not in block:
        missing.append(block)

if checked == 0:
    print("No AgentrixWatch build configurations found; ensure the target exists.", file=sys.stderr)
    sys.exit(1)

if missing:
    print("The following build settings blocks are missing SKIP_INSTALL = YES:", file=sys.stderr)
    for block in missing:
        print("---")
        print(block)
    sys.exit(1)

print(f"Verified {checked} AgentrixWatch build configuration(s) contain SKIP_INSTALL = YES.")
PY
