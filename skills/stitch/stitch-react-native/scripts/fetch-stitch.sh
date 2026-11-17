#!/bin/bash
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# NOTE: In Codot, Stitch `downloadUrl` endpoints require credentials and return a
# JSON wrapper instead of the raw file. Prefer Stitch MCP `download_file` (using
# `htmlCode.name` / `screenshot.name`) + `stitch-preview/scripts/save-stitch-file.mjs`.
# Keep this script only for pre-signed public URLs outside Codot.

URL=$1
OUTPUT=$2
if [ -z "$URL" ] || [ -z "$OUTPUT" ]; then
  echo "Usage: $0 <signed_url> <output_path>"
  echo "Note: In Codot, prefer MCP download_file + stitch-preview/scripts/save-stitch-file.mjs."
  exit 1
fi
mkdir -p "$(dirname "$OUTPUT")"
echo "Initiating fetch for Stitch asset (for Codot, prefer MCP download_file)..."
if curl -L -f -sS --connect-timeout 10 --compressed "$URL" -o "$OUTPUT"; then
  if head -c 1 "$OUTPUT" | grep -q '{' && ! echo "$OUTPUT" | grep -qiE '\.json$'; then
    echo "Warning: Response looks like JSON (downloadUrl requires credentials and returns a JSON wrapper)."
    echo "Use Stitch MCP download_file + stitch-preview/scripts/save-stitch-file.mjs instead."
    exit 1
  fi
  echo "Successfully retrieved asset at: $OUTPUT"
  exit 0
else
  echo "Error: Failed to retrieve content from URL."
  echo "In Codot, downloadUrl requires credentials; use Stitch MCP download_file (htmlCode.name / screenshot.name) + stitch-preview/scripts/save-stitch-file.mjs instead."
  exit 1
fi
