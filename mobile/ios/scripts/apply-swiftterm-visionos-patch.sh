#!/bin/bash
set -euo pipefail
SP_DIR="${SOURCEPACKAGES_DIR_PATH:-}"
if [[ -z "$SP_DIR" ]]; then
  exit 0
fi

python3 "${PROJECT_DIR}/scripts/apply-swiftterm-visionos-patch.py" "$SP_DIR"
