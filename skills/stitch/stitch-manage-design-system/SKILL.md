---
name: stitch-manage-design-system
description: "通过 Stitch MCP 管理 Stitch 中的设计系统：获取设计资产、创建或更新 DESIGN.md 主题，并将其应用到指定页面。"
allowed-tools:
  - "stitch*:*"
  - "Bash"
  - "Read"
  - "Write"
  - "web_fetch"
---

> **Codot Runtime Adaptation**
> - **Stitch MCP**: Provided centrally via **Codot Settings → MCP** (look for tools prefixed with `stitch:` or `mcp__stitch__`). Do not reconfigure per-agent MCP files.
> - **Browser & Visual Verification**: Prefer Codot's built-in `browser_*` tools (`browser_navigate`, `browser_snapshot`, `browser_screenshot`, `browser_console`) over external Chrome DevTools MCP when inspecting local dev servers or rendered pages.
> - **Visual Delivery**: `show_preview` is **offline and cannot access the network**; Stitch-exported HTML relies on CDN Tailwind/fonts and renders blank if passed directly. Use the `stitch-preview` skill (local static server + `browser_*` for full fidelity/interaction, or `stitch-offline.mjs` + `show_preview` for in-chat HTML preview, or `show_preview` directly on `.png` screenshots).
> - **Asset Download**: Always use Stitch MCP `download_file` (with `htmlCode.name` / `screenshot.name`), **never** `curl` against `downloadUrl` (which requires credentials and returns a JSON wrapper). If `download_file` output is truncated to a temporary file, decode it with `stitch-preview/scripts/save-stitch-file.mjs`.
> - **Object Parameters**: If an MCP tool fails with `expected object, got string` (some agent runtimes serialize object arguments as strings), switch to the string-only fallback workflow in `stitch-manage-design-system` instead of retrying the same failing call.
> - **Long-running Calls**: If `generate_screen_from_text` or `edit_screens` times out, poll `list_screens` every 60 seconds for up to ~5 minutes (5 polls); if no new screen appears, re-issue the call once instead of waiting indefinitely.
> - **Tool Mapping**: Map generic tool names (`Read`, `Write`, `Edit`, `Bash`) to the active Codot harness tools (`read`, `write`, `edit`, `bash`).

# Design-System

Create a "source of truth" for your project's design language to ensure
consistency across all future screens.

> [!NOTE]
> Refer to your system prompt for instruction on handling MCP tool prefixes for
> all tools mentioned in this skill (e.g., `get_screen`,
> `create_design_system_from_design_md`, `apply_design_system`).

## 📥 Retrieval

To analyze a Stitch project, you must retrieve metadata and assets using the
Stitch MCP tools:

1. **Project lookup**: Use `list_projects` to find the target `projectId`.
2. **Screen lookup**: Use `list_screens` for that `projectId` to find
   representative screens (e.g., "Home", "Main Dashboard").
3. **Metadata fetch**: Call `get_screen` for the target screen to get
   `screenshot.name` and `htmlCode.name` (`projects/{project}/files/{file}`).
4. **Asset download**: Call Stitch MCP `download_file` with `htmlCode.name` (and
   optionally `screenshot.name`). Do **not** use `curl` against `downloadUrl`.
   If the output is truncated to a temporary file, decode it with:
   `node skills/stitch/stitch-preview/scripts/save-stitch-file.mjs <tool-output> .stitch/designs/<name>.html`

## 🧠 Synthesis from Description

If you need to extract a design system from existing screens, use the `stitch-design-md` skill.

If there are no existing screens (new project), or the user provides a direct description (e.g., "dark theme, blue and purple, rounded, Inter font"):

1. Map the user's vague terms to precise values using the design mappings (see `stitch-design-md` or `stitch-generate-design`).
2. Select concrete hex codes, font families, and roundness values.
3. Generate the `DESIGN.md` file (refer to `stitch-design-md` for structure).
4. Proceed to the "Create or Update Design System in Stitch" step below.

## 📝 Output Structure

The `DESIGN.md` file should follow the structure defined in the `stitch-design-md` skill.

## 🚀 Create or Update Design System in Stitch

After generating `.stitch/DESIGN.md`, make sure to also create or update the
design system in Stitch.

**Two-step design system creation:**

> [!WARNING]
> **Checkpoint — User Confirmation Required.**
> Before uploading, you **MUST** pause and ask the user for
> confirmation. Present a summary of the design system you are about to create
> (display name, key colors, fonts, and roundness) and wait for explicit approval
> before proceeding. Do **NOT** upload until the user confirms.

1. **Upload `DESIGN.md`**:
   - **Option A (Direct MCP Tool — string parameters)**: If `DESIGN.md` is under ~5KB, call `upload_design_md` with `projectId` and base64-encoded `designMdBase64`.
   - **Option B (Uploader Script — large files)**: Use the script in `stitch-upload-to-stitch` to bypass base64 output token limits:
     ```bash
     python3 skills/stitch/stitch-upload-to-stitch/scripts/upload_to_stitch.py \
       --project-id <PROJECT_ID> \
       --file-path /path/to/DESIGN.md \
       --api-key <API_KEY> \
       --generated-by <GENERATED_BY>
     ```
     Get `<API_KEY>` from the `X-Goog-Api-Key` header of the `stitch` MCP server in **Codot Settings → MCP** (or ask the user if unavailable; never hardcode or commit any real key).
     Set `<GENERATED_BY>` to identify the calling skill or tool (e.g., `stitch-code-to-design`, `stitch-design-md`, or `Codot`). If omitted, the script defaults to `UserUploadedDesignMd`.

     This returns the `sourceScreen` ID and the `screenInstance` ID.
2. **Create Design System**: Call `create_design_system_from_design_md` passing `projectId` and `selectedScreenInstance` (`id` and `sourceScreen`).

### String-Only Fallback Workflow (When Object Parameters Fail)

Some agent runtimes (e.g., pi) serialize MCP object arguments as strings, causing
`create_design_system`, `create_design_system_from_design_md`,
`update_design_system`, and `apply_design_system` to fail with
`expected object, got string`. If you hit this error, **do not retry the same
call** — use this string-only workflow instead:

1. **Upload `DESIGN.md`**: Call `upload_design_md` (`projectId` + base64 string `designMdBase64`), or run `upload_to_stitch.py` if larger than ~5KB.
2. **Auto-create via first generation**: Call `generate_screen_from_text` on the project **without** `designSystem` — Stitch automatically generates a design system from the uploaded `DESIGN.md`.
3. **Fetch the asset ID**: Call `list_design_systems` (`projectId`) to retrieve the generated design system resource name (`assets/<id>`).
4. **Pass as string going forward**: Pass `"designSystem": "assets/<id>"` (a plain string) on all subsequent `generate_screen_from_text` calls.

> [!IMPORTANT]
> **Post-check for auto-generated fonts & colors**: After the first screen is
> generated, inspect `list_design_systems` and the exported HTML's
> `fontFamily` / colors to verify they match `DESIGN.md`. Stitch may choose
> default web fonts (e.g., `Space Grotesk`, `Inter`, `JetBrains Mono`) even when
> `DESIGN.md` specifies `SF Pro` or platform-native fonts. If it deviates,
> adjust it manually in the Stitch web UI or explicitly specify the desired
> font/colors in your prompt.

Once the design system exists in Stitch, pass its `assets/<id>` string in
`generate_screen_from_text` so you do not need to repeat theme tokens on every screen.

## 🎨 Apply Design System to Screens

Use `apply_design_system` to apply a design system to existing screens.

> [!IMPORTANT]
> `selectedScreenInstances` must contain **only** `id` and `sourceScreen` — do
> NOT include position/dimension fields (`x`, `y`, `width`, `height`) or the
> request will fail with "invalid argument". Get the screen instance IDs from
> `get_project`.

```json
{
  "projectId": "...",
  "assetId": "...",
  "selectedScreenInstances": [
    {
      "id": "...",
      "sourceScreen": "projects/.../screens/..."
    }
  ]
}
```

**How to get the required IDs:**
1. Call `get_project` to retrieve `screenInstances` — each has an `id` and
   `sourceScreen`.
2. Call `list_design_systems` to retrieve the design system `name` (format:
   `assets/{assetId}`) — use the part after `assets/` as the `assetId`.
3. Filter out any instances with `type: "DESIGN_SYSTEM_INSTANCE"` — only pass
   real screens.

## 📋 Update Project Metadata

After writing `.stitch/DESIGN.md`, also create or update `.stitch/metadata.json`
to track the `projectId`, `title`, all known screens, and design system summary.
See [examples/metadata.json](examples/metadata.json) for the format.

## Schema Reference

See [reference/tool-schema.md](reference/tool-schema.md) for the full
`designSystem` object schema with all available options.

## 💡 Best Practices

Refer to the `stitch-design-md` skill for best practices on describing design elements.
