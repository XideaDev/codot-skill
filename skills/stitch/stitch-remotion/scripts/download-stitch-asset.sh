#!/bin/bash

# NOTE: In Codot, Stitch `downloadUrl` endpoints require credentials and return a
# JSON wrapper instead of the raw asset. Prefer Stitch MCP `download_file` (using
# `screenshot.name` / `htmlCode.name`) + `stitch-preview/scripts/save-stitch-file.mjs`.
# Keep this script only for pre-signed public URLs outside Codot.

set -e

if [ $# -ne 2 ]; then
  echo "Usage: $0 <signed_download_url> <output_path>"
  echo "Note: In Codot, prefer MCP download_file + stitch-preview/scripts/save-stitch-file.mjs."
  echo "Example: $0 'https://storage.googleapis.com/stitch/screenshot.png' 'assets/screen.png'"
  exit 1
fi

DOWNLOAD_URL="$1"
OUTPUT_PATH="$2"

# Create directory if it doesn't exist
OUTPUT_DIR=$(dirname "$OUTPUT_PATH")
mkdir -p "$OUTPUT_DIR"

echo "Downloading from: $DOWNLOAD_URL"
echo "Saving to: $OUTPUT_PATH"

# Use curl with follow redirects; -f fails on HTTP errors so an error
# response (e.g. an expired signed URL) is not saved as the asset
if curl -L -f -o "$OUTPUT_PATH" "$DOWNLOAD_URL"; then
  if head -c 1 "$OUTPUT_PATH" | grep -q '{' && ! echo "$OUTPUT_PATH" | grep -qiE '\.json$'; then
    echo "✗ Response looks like JSON (downloadUrl requires credentials and returns a JSON wrapper)."
    echo "  Use Stitch MCP download_file + stitch-preview/scripts/save-stitch-file.mjs instead."
    rm -f "$OUTPUT_PATH"
    exit 1
  fi
  echo "✓ Successfully downloaded to $OUTPUT_PATH"

  # Display file size for verification
  if command -v stat &> /dev/null; then
    FILE_SIZE=$(stat -f%z "$OUTPUT_PATH" 2>/dev/null || stat -c%s "$OUTPUT_PATH" 2>/dev/null)
    echo "  File size: $FILE_SIZE bytes"
  fi
else
  echo "✗ Download failed"
  echo "  In Codot, downloadUrl requires credentials; use Stitch MCP download_file + stitch-preview/scripts/save-stitch-file.mjs instead."
  rm -f "$OUTPUT_PATH"
  exit 1
fi
