#!/usr/bin/env sh

set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT INT TERM

find "$ROOT_DIR" \
  -path "$ROOT_DIR/.git" -prune -o \
  -path "$ROOT_DIR/node_modules" -prune -o \
  -path "$ROOT_DIR/dist" -prune -o \
  -path "$ROOT_DIR/.idea" -prune -o \
  -path "$ROOT_DIR/.vscode" -prune -o \
  -type f \
  \( \
    -name "*.jks" -o \
    -name "*.keystore" -o \
    -name "*.p12" -o \
    -name "*.mobileprovision" -o \
    -name "*.cer" -o \
    -name "*.pem" -o \
    -name "*.key" -o \
    -name "key.properties" -o \
    -name ".env" -o \
    -name ".env.*" \
  \) \
  -print > "$TMP_FILE"

if [ -s "$TMP_FILE" ]; then
  echo "Potential secret-bearing mobile files found:"
  sed 's/^/ - /' "$TMP_FILE"
  exit 1
fi

echo "No obvious mobile secret files found."
