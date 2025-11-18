#!/usr/bin/env bash

set -euo pipefail

ARCHIVE_ROOT="${1:-mobile/ios/build/Agentrix.xcarchive}"
WATCH_APP="$ARCHIVE_ROOT/Products/Applications/Agentrix.app/Watch/AgentrixWatch.app"
WATCH_EXTENSION="$WATCH_APP/PlugIns/AgentrixWatchExtension.appex"

if [[ ! -d "$WATCH_APP" ]]; then
  echo "Watch app bundle not found at $WATCH_APP" >&2
  exit 1
fi

if [[ ! -d "$WATCH_EXTENSION" ]]; then
  echo "Watch extension bundle not found at $WATCH_EXTENSION" >&2
  exit 1
fi

function extract_field() {
  local plist="$1"
  local key="$2"
  security cms -D -i "$plist" | /usr/bin/plutil -extract "$key" raw - 2>/dev/null
}

function verify_profile() {
  local bundle="$1"
  local expected="$2"
  local label="$3"

  local provision="$bundle/embedded.mobileprovision"
  if [[ ! -f "$provision" ]]; then
    echo "Missing embedded.mobileprovision for $label: $provision" >&2
    exit 1
  fi

  local identifier
  identifier=$(extract_field "$provision" "Entitlements.application-identifier")
  local profile_name
  profile_name=$(extract_field "$provision" "Name")

  if [[ "$identifier" != "$expected" ]]; then
    echo "❌ $label signed with $identifier (profile \"$profile_name\"), expected $expected" >&2
    exit 1
  fi

  echo "✅ $label signed with $identifier (profile \"$profile_name\")"
}

verify_profile "$WATCH_APP" "J3GGLYH7P8.me.simonskinner.agentrix.watch" "AgentrixWatch.app"
verify_profile "$WATCH_EXTENSION" "J3GGLYH7P8.me.simonskinner.agentrix.watch.extension" "AgentrixWatchExtension.appex"
