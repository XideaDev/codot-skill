#!/usr/bin/env node
/**
 * Make a Stitch-exported HTML file self-contained for offline preview (e.g., Codot show_preview).
 *
 * - Extracts tailwind.config and compiles purged/minified CSS via tailwindcss@3.4.17
 * - Collects Material Symbols icon names (from data-icon and .material-symbols-* elements),
 *   downloads a subsetted woff2 font with Safari UA, and inlines it as base64 data URI
 * - Injects icon CSS BEFORE compiled Tailwind CSS so utility classes (e.g. text-[13px]) win
 * - Strips external <link> and Tailwind CDN <script> tags
 * - Optionally forces system UI fonts (--system-font) while preserving icon fonts
 *
 * Usage:
 *   node stitch-offline.mjs <stitch.html> [out.html] [--system-font]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

function usage() {
  console.error('Usage: node stitch-offline.mjs <stitch.html> [out.html] [--system-font]');
}

function parseArgs(argv) {
  let systemFont = false;
  const positional = [];
  for (const arg of argv) {
    if (arg === '--system-font') {
      systemFont = true;
    } else if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    } else if (arg.startsWith('-')) {
      console.error(`Error: Unknown flag "${arg}"`);
      usage();
      process.exit(1);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length < 1) {
    usage();
    process.exit(1);
  }
  const inputPath = path.resolve(positional[0]);
  let outPath;
  if (positional[1]) {
    outPath = path.resolve(positional[1]);
  } else {
    const parsed = path.parse(inputPath);
    outPath = path.join(parsed.dir, `${parsed.name}-offline${parsed.ext || '.html'}`);
  }
  return { inputPath, outPath, systemFont };
}

function extractTailwindConfigScript(html) {
  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    const attrs = match[1] || '';
    const body = match[2] || '';
    if (/id\s*=\s*["']tailwind-config["']/i.test(attrs) || /tailwind\.config\s*=/.test(body)) {
      return { fullTag: match[0], body };
    }
  }
  return null;
}

function buildTailwindCss(absInputPath, configScriptBody) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitch-offline-'));
  try {
    const inCssPath = path.join(tmpDir, 'in.css');
    const outCssPath = path.join(tmpDir, 'out.css');
    const cfgPath = path.join(tmpDir, 'tailwind.config.js');

    fs.writeFileSync(inCssPath, '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n', 'utf8');

    let configJs;
    if (configScriptBody) {
      // Strip bare `plugins: [...]` lines if they reference browser CDN globals not present in Node
      const sanitizedBody = configScriptBody.replace(/\bplugins\s*:\s*\[[\s\S]*?\]\s*,?/g, '');
      configJs = [
        'const tailwind = {};',
        'const window = { tailwind };',
        sanitizedBody,
        'const cfg = (tailwind && tailwind.config) || (window.tailwind && window.tailwind.config) || {};',
        `cfg.content = [${JSON.stringify(absInputPath)}];`,
        'if (cfg.plugins) delete cfg.plugins;',
        'module.exports = cfg;',
      ].join('\n');
    } else {
      configJs = `module.exports = { content: [${JSON.stringify(absInputPath)}] };\n`;
    }

    fs.writeFileSync(cfgPath, configJs, 'utf8');

    const res = spawnSync(
      'npx',
      ['-y', 'tailwindcss@3.4.17', '-c', cfgPath, '-i', inCssPath, '-o', outCssPath, '--minify'],
      {
        cwd: tmpDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    if (res.error) {
      throw new Error(`Failed to invoke npx tailwindcss@3.4.17: ${res.error.message}`);
    }
    if (res.status !== 0) {
      const detail = (res.stderr || res.stdout || '').trim();
      throw new Error(`Tailwind compilation failed (exit ${res.status}):\n${detail}`);
    }
    if (!fs.existsSync(outCssPath)) {
      throw new Error('Tailwind compilation produced no output CSS file.');
    }
    return fs.readFileSync(outCssPath, 'utf8');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function collectMaterialIcons(html) {
  const icons = new Set();
  const families = new Set();

  if (/Material\+Symbols\+Rounded/i.test(html) || /material-symbols-rounded/.test(html)) {
    families.add('Material+Symbols+Rounded');
  }
  if (/Material\+Symbols\+Sharp/i.test(html) || /material-symbols-sharp/.test(html)) {
    families.add('Material+Symbols+Sharp');
  }
  if (
    families.size === 0 &&
    (/Material\+Symbols\+Outlined/i.test(html) || /material-symbols-outlined/.test(html))
  ) {
    families.add('Material+Symbols+Outlined');
  }

  const dataIconRe = /\bdata-icon\s*=\s*["']([a-z0-9_]+)["']/gi;
  let m;
  while ((m = dataIconRe.exec(html)) !== null) {
    icons.add(m[1].trim());
  }

  const spanRe =
    /<([a-z0-9-]+)\b[^>]*class\s*=\s*["'][^"']*material-symbols-(?:outlined|rounded|sharp)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi;
  while ((m = spanRe.exec(html)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    if (text && /^[a-z0-9_]+$/i.test(text)) {
      icons.add(text);
    }
  }

  return {
    families: families.size > 0 ? Array.from(families) : ['Material+Symbols+Outlined'],
    icons: Array.from(icons).sort(),
  };
}

async function fetchText(url) {
  let resp;
  try {
    resp = await fetch(url, {
      headers: {
        'User-Agent': SAFARI_UA,
        Accept: 'text/css,*/*;q=0.1',
      },
    });
  } catch (err) {
    throw new Error(`Network error fetching ${url}: ${err.message}`);
  }
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText} fetching ${url}`);
  }
  return resp.text();
}

async function fetchBuffer(url) {
  let resp;
  try {
    resp = await fetch(url, {
      headers: {
        'User-Agent': SAFARI_UA,
      },
    });
  } catch (err) {
    throw new Error(`Network error downloading font ${url}: ${err.message}`);
  }
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText} downloading font ${url}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

async function buildInlinedIconsCss(families, icons) {
  if (icons.length === 0) {
    return '';
  }

  const iconList = icons.join(',');
  const cssParts = [];

  for (const family of families) {
    const cssUrl =
      `https://fonts.googleapis.com/css2?family=${family}` +
      `:opsz,wght,FILL,GRAD@24,400,0..1,0&icon_names=${encodeURIComponent(iconList)}&display=block`;

    let cssText = await fetchText(cssUrl);

    const urlMatches = Array.from(cssText.matchAll(/url\((https:\/\/[^)\s'"]+)\)/g));
    if (urlMatches.length === 0) {
      throw new Error(
        `Google Fonts CSS for ${family} did not contain a font URL. Response:\n${cssText.slice(0, 400)}`
      );
    }

    const uniqueUrls = Array.from(new Set(urlMatches.map((u) => u[1])));
    for (const fontUrl of uniqueUrls) {
      const buf = await fetchBuffer(fontUrl);
      const ext = fontUrl.includes('.woff2') || cssText.includes("format('woff2')") ? 'woff2' : 'ttf';
      const dataUri = `data:font/${ext};base64,${buf.toString('base64')}`;
      cssText = cssText.split(fontUrl).join(dataUri);
    }

    cssParts.push(cssText.trim());
  }

  return cssParts.join('\n\n');
}

function stripExternalAssets(html) {
  // Remove external <link ... href="http(s)://..."> tags (Google Fonts, preconnect, external CSS)
  let out = html.replace(/<link\b[^>]*\bhref\s*=\s*["']https?:\/\/[^"']*["'][^>]*\/?>\s*/gi, '');
  // Remove Tailwind CDN script tag
  out = out.replace(/<script\b[^>]*\bsrc\s*=\s*["']https?:\/\/cdn\.tailwindcss\.com[^"']*["'][^>]*>\s*<\/script>\s*/gi, '');
  // Remove inline tailwind-config script block
  out = out.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>\s*/gi, (full, attrs, body) => {
    if (/id\s*=\s*["']tailwind-config["']/i.test(attrs) || /tailwind\.config\s*=/.test(body)) {
      return '';
    }
    return full;
  });
  return out;
}

function injectHeadStyles(html, styleBlocks) {
  const combined = styleBlocks.filter(Boolean).join('');
  if (!combined) return html;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${combined}</head>`);
  }
  if (/<body\b/i.test(html)) {
    return html.replace(/<body\b/i, `${combined}<body`);
  }
  return `${combined}\n${html}`;
}

function findRemainingExternalUrls(html) {
  const urls = new Set();
  const re = /https?:\/\/[^\s"'<>)]+/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = m[0];
    // Ignore Tailwind CSS license banner URL and XML namespaces (e.g., SVG xmlns)
    if (url.startsWith('https://tailwindcss.com') || url.startsWith('http://www.w3.org/')) {
      continue;
    }
    urls.add(url);
  }
  return Array.from(urls);
}

async function main() {
  const { inputPath, outPath, systemFont } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input HTML file not found: ${inputPath}`);
    process.exit(1);
  }

  const originalHtml = fs.readFileSync(inputPath, 'utf8');
  const twConfigMatch = extractTailwindConfigScript(originalHtml);

  console.log(`Building Tailwind CSS from ${path.basename(inputPath)}...`);
  const tailwindCss = buildTailwindCss(inputPath, twConfigMatch ? twConfigMatch.body : '');

  const { families, icons } = collectMaterialIcons(originalHtml);
  let iconsCss = '';
  if (icons.length > 0) {
    console.log(`Fetching subsetted Material Symbols (${icons.length} icons: ${icons.join(', ')})...`);
    iconsCss = await buildInlinedIconsCss(families, icons);
  } else {
    console.log('No Material Symbols icons detected; skipping icon font download.');
  }

  let outputHtml = stripExternalAssets(originalHtml);

  // Order is critical: icons CSS MUST come before compiled Tailwind CSS so utility
  // classes (e.g. text-[13px], text-[20px]) override `.material-symbols-outlined { font-size: 24px }`.
  const styleBlocks = [];
  if (iconsCss) {
    styleBlocks.push(`<style>${iconsCss}</style>`);
  }
  styleBlocks.push(`<style>${tailwindCss}</style>`);
  if (systemFont) {
    const iconFontRules = [
      '.material-symbols-outlined{font-family:"Material Symbols Outlined"!important}',
      '.material-symbols-rounded{font-family:"Material Symbols Rounded"!important}',
      '.material-symbols-sharp{font-family:"Material Symbols Sharp"!important}',
    ].join('');
    styleBlocks.push(
      `<style>*{font-family:-apple-system,"SF Pro Text","PingFang SC",sans-serif}${iconFontRules}</style>`
    );
  }

  outputHtml = injectHeadStyles(outputHtml, styleBlocks);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, outputHtml, 'utf8');

  const remaining = findRemainingExternalUrls(outputHtml);
  console.log(`Wrote offline HTML -> ${outPath} (${Buffer.byteLength(outputHtml, 'utf8')} bytes)`);
  console.log(`Remaining external URLs (excluding Tailwind banner / XMLNS): ${remaining.length}`);
  if (remaining.length > 0) {
    for (const url of remaining) {
      console.log(`  - ${url}`);
    }
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
