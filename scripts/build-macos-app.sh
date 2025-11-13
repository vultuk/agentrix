#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IOS_DIR="$ROOT_DIR/mobile/ios"
OUTPUT_DIR="$ROOT_DIR/build/macos"
APP_NAME="AgentrixMobile"
SCHEME="AgentrixMobile"
PROJECT="AgentrixMobile.xcodeproj"
DESTINATION="platform=macOS,arch=arm64"

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

echo "Building $APP_NAME for macOS..."
xcodebuild \
  -project "$IOS_DIR/$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination "$DESTINATION" \
  CODE_SIGNING_ALLOWED=NO \
  BUILD_DIR="$OUTPUT_DIR" \
  BUILD_ROOT="$OUTPUT_DIR/Build" \
  clean build > /tmp/xcodebuild.log

APP_PATH="$OUTPUT_DIR/Release/${APP_NAME}.app"
if [[ ! -d "$APP_PATH" ]]; then
  echo "Expected app bundle not found at $APP_PATH"
  exit 1
fi

RELEASE_DIR="$ROOT_DIR/build"
mkdir -p "$RELEASE_DIR"
ZIP_PATH="$RELEASE_DIR/${APP_NAME}-macOS.zip"
rm -f "$ZIP_PATH"

echo "Packaging $APP_PATH into $ZIP_PATH"
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" "$ZIP_PATH"

if [[ -n "${GITHUB_ENV:-}" ]]; then
  echo "MAC_APP_ZIP=$ZIP_PATH" >> "$GITHUB_ENV"
fi
echo "Build complete: $ZIP_PATH"
