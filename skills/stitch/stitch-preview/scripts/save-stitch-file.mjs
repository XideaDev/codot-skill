#!/usr/bin/env node
/**
 * Decode a Stitch MCP `download_file` JSON (or truncated full-output .txt)
 * and write the decoded HTML or image binary to disk.
 *
 * Usage:
 *   node save-stitch-file.mjs <tool-output.json|txt> <out-path>
 */

import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.error('Usage: node save-stitch-file.mjs <tool-output.json|txt> <out-path>');
}

function extFromMime(mimeType) {
  if (!mimeType || typeof mimeType !== 'string') return '.png';
  const normalized = mimeType.toLowerCase().trim();
  if (normalized === 'png' || normalized === 'image/png') return '.png';
  if (normalized === 'jpg' || normalized === 'jpeg' || normalized === 'image/jpeg') return '.jpg';
  if (normalized === 'webp' || normalized === 'image/webp') return '.webp';
  if (normalized === 'gif' || normalized === 'image/gif') return '.gif';
  if (normalized === 'svg' || normalized === 'image/svg+xml') return '.svg';
  const slashIdx = normalized.indexOf('/');
  if (slashIdx !== -1) {
    const sub = normalized.slice(slashIdx + 1).replace(/[^a-z0-9]/g, '');
    if (sub) return `.${sub === 'jpeg' ? 'jpg' : sub}`;
  }
  return '.png';
}

function unwrapPayload(rawText) {
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (firstErr) {
    // Handle tool output files that have leading/trailing non-JSON log lines
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        parsed = JSON.parse(rawText.slice(firstBrace, lastBrace + 1));
      } catch {
        throw new Error(`Input file is not valid JSON: ${firstErr.message}`);
      }
    } else {
      throw new Error(`Input file is not valid JSON: ${firstErr.message}`);
    }
  }

  // Handle MCP content wrapper: { content: [{ type: "text", text: "{...}" }] } or [{ type: "text", text: "{...}" }]
  if (Array.isArray(parsed)) {
    const textItem = parsed.find((item) => item && typeof item.text === 'string');
    if (textItem) {
      return unwrapPayload(textItem.text);
    }
  }
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.content)) {
    const textItem = parsed.content.find((item) => item && typeof item.text === 'string');
    if (textItem) {
      return unwrapPayload(textItem.text);
    }
  }
  return parsed;
}

function resolveOutputPath(outArg, defaultExt) {
  const endsWithSep = outArg.endsWith(path.sep) || outArg.endsWith('/');
  if (endsWithSep || (fs.existsSync(outArg) && fs.statSync(outArg).isDirectory())) {
    return path.join(outArg, `stitch-asset${defaultExt}`);
  }
  if (!path.extname(outArg)) {
    return `${outArg}${defaultExt}`;
  }
  return outArg;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2 || args.includes('-h') || args.includes('--help')) {
    usage();
    process.exit(args.includes('-h') || args.includes('--help') ? 0 : 1);
  }

  const [inputPath, outArg] = args;
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  let rawText;
  try {
    rawText = fs.readFileSync(inputPath, 'utf8');
  } catch (err) {
    console.error(`Error: Failed to read input file "${inputPath}": ${err.message}`);
    process.exit(1);
  }

  if (!rawText.trim()) {
    console.error(`Error: Input file is empty: ${inputPath}`);
    process.exit(1);
  }

  let payload;
  try {
    payload = unwrapPayload(rawText);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  if (!payload || typeof payload !== 'object') {
    console.error('Error: Parsed JSON is not an object.');
    process.exit(1);
  }

  if (typeof payload.html === 'string') {
    const outPath = resolveOutputPath(outArg, '.html');
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(outPath, payload.html, 'utf8');
    const bytes = Buffer.byteLength(payload.html, 'utf8');
    console.log(`Saved HTML -> ${outPath} (${bytes} bytes)`);
    return;
  }

  if (typeof payload.image === 'string') {
    const meta = payload.imageMetadata || payload.image_metadata || {};
    let b64 = payload.image.trim();
    let mimeType = meta.mimeType || meta.mime_type || '';

    const dataUriMatch = b64.match(/^data:([^;]+);base64,(.+)$/s);
    if (dataUriMatch) {
      if (!mimeType) mimeType = dataUriMatch[1];
      b64 = dataUriMatch[2];
    }

    if (!b64) {
      console.error('Error: "image" field is empty.');
      process.exit(1);
    }

    const buf = Buffer.from(b64, 'base64');
    if (buf.length === 0) {
      console.error('Error: Decoded image buffer is empty (invalid base64?).');
      process.exit(1);
    }

    const defaultExt = extFromMime(mimeType);
    const outPath = resolveOutputPath(outArg, defaultExt);
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(outPath, buf);
    console.log(`Saved image (${mimeType || defaultExt}) -> ${outPath} (${buf.length} bytes)`);
    return;
  }

  const keys = Object.keys(payload).join(', ') || '(none)';
  console.error(
    `Error: Expected "html" or "image" string field in JSON payload, found keys: [${keys}].`
  );
  process.exit(1);
}

main();
