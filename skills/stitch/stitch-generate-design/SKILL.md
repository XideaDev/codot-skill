---
name: stitch-generate-design
description: "通过 Stitch MCP 根据文本提示词或参考图生成新页面，编辑现有页面、应用设计系统 Token，并生成多套设计变体。"
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

# Generate Design

Create new design screens from text descriptions, images, or mockups, edit
existing screens with prompts and design system tokens, and generate design
variants using Stitch MCP.

> [!NOTE]
> Refer to your system prompt for instruction on handling MCP tool prefixes for
> all tools mentioned in this skill (e.g., `list_projects`,
> `generate_screen_from_text`, `edit_screens`).

## 🎨 Prompt Enhancement Pipeline

Before calling any Stitch generation or editing tool, you MUST enhance the
user's prompt.

### 1. Analyze Context

- **Project**: Use `list_projects` to find the correct `projectId`. If no
  suitable project exists, create one using `create_project`.
- **Design System**: Check if a design system exists for the project via
  `list_design_systems`. If one exists (`assets/<id>`), pass it as the
  `designSystem` string parameter in `generate_screen_from_text`, and avoid
  conflicting color/theme instructions in the prompt. If none exists, delegate
  to `stitch-manage-design-system` first (or follow its string-only fallback
  workflow: `upload_design_md` → first `generate_screen_from_text` auto-creates
  the design system → `list_design_systems` returns `assets/<id>`).

### 2. Refine UI/UX Terminology

Consult [Design Mappings](references/design-mappings.md) to replace vague terms.

- Vague: "Make a nice header"
- Professional: "Sticky navigation bar with glassmorphism effect and centered
  logo"

Use [Prompting Keywords](references/prompt-keywords.md) for component names,
adjective palettes, color roles, and shape descriptions.

### 3. Structure the Final Prompt

Format the enhanced prompt for Stitch. Focus primarily on **layout, content,
and structure** — keep colors, roundness, and theme tokens in the project-level
design system. **Font exception**: when the project design system's font (or
Stitch's auto-selected fonts such as Space Grotesk / Inter / JetBrains Mono)
differs from platform-native requirements (e.g., iOS requiring SF Pro, which
Stitch does not provide as a design-system font), you **may** specify the
target font family explicitly in the prompt. After generation, inspect
`fontFamily` in the exported HTML `<script id="tailwind-config">` (and use
`stitch-offline.mjs --system-font` when previewing offline if needed).

For **new screens**, use this template:

```markdown
[Overall purpose and user intent of the page]

**PLATFORM:** [Web/Mobile], [Desktop/Mobile]-first

**PAGE STRUCTURE:**
1. **Header:** [Description of navigation and branding]
2. **Hero Section:** [Headline, subtext, and primary CTA]
3. **Primary Content Area:** [Detailed component breakdown]
4. **Footer:** [Links and copyright information]
```

For **edits**, be specific about what to change:

- **Location**: "Change the [primary button] in the [hero section]..."
- **Visuals**: "...to a darker blue (#004080) and add a subtle shadow."
- **Structure**: "Add a secondary button next to the primary one with the text
  'Learn More'."

> [!CAUTION]
> Do NOT include hex codes, color palettes, or roundness values in a
> **generation** prompt when a design system is active — they will conflict if
> duplicated. Font names should also stay out of generation prompts unless
> overriding an unsupported platform-native font as noted above. (For **edit**
> prompts, hex codes are acceptable for precise color adjustments.)

### 4. Present AI Insights

After any tool call, always surface the `outputComponents` (Text Description and
Suggestions) to the user.

See [examples/enhanced-prompt.md](examples/enhanced-prompt.md) for a full
before/after prompt enhancement example.

--------------------------------------------------------------------------------

## Steps

### Determine the Mode

Decide which flow to use based on the user's request:

- User wants to create from a text description → **Generate from Text** flow
- User provides an image, screenshot, or mockup → **Generate from Image** flow
- User wants to modify an existing screen → **Edit** flow
- User wants layout/color/content variations → **Generate Variants** flow

---

### Generate from Text Flow (New Screen)

#### 1. Enhance the User Prompt

Apply the Prompt Enhancement Pipeline above.

#### 2. Identify the Project

Use `list_projects` to find the correct `projectId` if it is not already known.

#### 3. Generate the Screen

Call the `generate_screen_from_text` tool with the enhanced prompt and the
`designSystem` string ID (`"assets/<id>"`, if returned by `list_design_systems`).

```json
{
  "projectId": "...",
  "prompt": "[Your Enhanced Prompt]",
  "designSystem": "assets/...", // Optional: string ID from list_design_systems
  "deviceType": "DESKTOP"  // Options: MOBILE, DESKTOP, TABLET
}
```

> [!NOTE]
> **Timeout Handling**: If `generate_screen_from_text` times out (~60s client
> timeout), poll `list_screens` every 60 seconds for up to ~5 minutes (5 polls).
> If no new screen appears, re-issue the same `generate_screen_from_text` call
> once instead of waiting indefinitely.

#### 4. Present AI Feedback

Always show the text description and suggestions from `outputComponents` to the
user.

#### 5. Download Design Assets

After generation, download the HTML and screenshot via Stitch MCP `download_file`
into `.stitch/designs/`:

- **Identifiers**: Pass `htmlCode.name` and `screenshot.name` (`projects/{project}/files/{file}`) to `download_file`. Do **not** use `curl -o` on `downloadUrl` (it requires credentials and returns a JSON wrapper).
- **Save to disk**: Save as `.stitch/designs/{slug}.html` and `.stitch/designs/{slug}.png`. If `download_file` output is truncated to a temporary file, decode it with:
  `node skills/stitch/stitch-preview/scripts/save-stitch-file.mjs <tool-output> .stitch/designs/{slug}.html` (and `.png`).
- **Font check**: Inspect `fontFamily` in `<script id="tailwind-config">` of the downloaded HTML if platform-native fonts (e.g., SF Pro) are required.
- **Directory**: Ensure `.stitch/designs` exists.

#### 6. Review and Refine

- If the result is not exactly as expected, continue with the **Edit** flow
  to make targeted adjustments.
- Do NOT re-generate from scratch unless the fundamental layout is wrong.

---

### Generate from Image Flow (Image/Mockup → Design)

Use this flow when the user provides an image, screenshot, or design mockup to
recreate in Stitch.

#### 1. Identify the Project

Use `list_projects` to find the correct `projectId`. If no suitable project
exists, create one using `create_project`.

#### 2. Upload the Image

Delegate to the **upload-to-stitch** skill to upload the image to the project.
This creates a new screen with the image as its content.

#### 3. Refine with Edit

Once uploaded, use `list_screens` to find the newly created `screenId`, then
call `edit_screens` with a descriptive prompt to refine the design:

```json
{
  "projectId": "...",
  "selectedScreenIds": ["<uploaded-screen-id>"],
  "prompt": "[Describe what to adjust, enhance, or recreate from this mockup]"
}
```

> [!TIP]
> For best results, describe the intent behind the image rather than just saying
> "make it look like this". For example: "This is a dashboard mockup — recreate
> it with a proper data table, sidebar navigation, and chart widgets."

#### 4. Present AI Feedback

Always show the text description and suggestions from `outputComponents` to the
user.

#### 5. Download Design Assets

Download the HTML and screenshot via Stitch MCP `download_file` (using
`htmlCode.name` and `screenshot.name`) into `.stitch/designs/`. Do **not** use
`curl -o` on `downloadUrl`.

- **Naming**: Use the screen ID or a descriptive slug for the filename.
- **Tools**: `download_file` + `node skills/stitch/stitch-preview/scripts/save-stitch-file.mjs <tool-output> .stitch/designs/{slug}.{html|png}` when output is truncated.
- **Directory**: Ensure `.stitch/designs` exists.

---

### Edit Flow (Modify Existing Screen)

#### 1. Identify the Screen

Use `list_screens` or `get_screen` to find the correct `projectId` and
`screenId`.

#### 2. Formulate the Edit Prompt

Apply the Prompt Enhancement Pipeline, focusing on specificity:

- **Location**: "Change the color of the [primary button] in the [hero
  section]..."
- **Visuals**: "...to a darker blue (#004080) and add a subtle shadow."
- **Structure**: "Add a secondary button next to the primary one with the text
  'Learn More'."

#### 3. Apply the Edit

Call the `edit_screens` tool. If it times out, poll `list_screens` every 60s for
up to ~5 minutes (5 polls) before re-issuing once.

```json
{
  "projectId": "...",
  "selectedScreenIds": ["..."],
  "prompt": "[Your targeted edit prompt]"
}
```

#### 4. Present AI Feedback

Always show the text description and suggestions from `outputComponents` to the
user.

#### 5. Download Design Assets

After editing, download the updated HTML and screenshot via Stitch MCP
`download_file` (using `htmlCode.name` and `screenshot.name`) into
`.stitch/designs/`, overwriting previous versions so local files reflect the
latest edits. Do **not** use `curl -o` on `downloadUrl`.

- **Naming**: Use the screen ID or a descriptive slug for the filename.
- **Tools**: `download_file` + `node skills/stitch/stitch-preview/scripts/save-stitch-file.mjs <tool-output> .stitch/designs/{slug}.{html|png}` when output is truncated.
- **Directory**: Ensure `.stitch/designs` exists.

#### 6. Update Project Metadata

After downloading assets, update `.stitch/metadata.json` to reflect any changes
(e.g., updated screen titles or new screen IDs from the edit). The metadata
file tracks all screens, their device types, and design system info. See the
**manage-design-system** skill's `examples/metadata.json` for the format.

#### 7. Verify and Repeat

- Check the output screen to see if the changes were applied correctly.
- If more polish is needed, repeat the edit flow with a new specific prompt.

---

### Generate Variants Flow (Explore Variations)

Use this flow when the user wants to explore alternative layouts, color schemes,
or content variations of an existing screen.

#### 1. Identify the Screen

Use `list_screens` or `get_screen` to find the correct `projectId` and
`screenId`.

#### 2. Configure Variant Options

Call the `generate_variants` tool with the appropriate options:

```json
{
  "projectId": "...",
  "selectedScreenIds": ["..."],
  "prompt": "[Describe the direction for variants]",
  "variantOptions": {
    "variantCount": 3,
    "creativeRange": "EXPLORE",
    "aspects": ["LAYOUT", "COLOR_SCHEME"]
  }
}
```

> [!WARNING]
> **Object Parameter Fallback**: `variantOptions` is an object parameter. If the
> active agent runtime rejects it with `expected object, got string`, do **not**
> retry `generate_variants` — instead create variations using multiple targeted
> `edit_screens` calls (or separate `generate_screen_from_text` calls with the
> `designSystem` string ID).

**Variant Options:**
- **`variantCount`**: 1–5 variants (default: 3)
- **`creativeRange`**: `REFINE` (subtle), `EXPLORE` (balanced), or `REIMAGINE`
  (radical)
- **`aspects`**: Focus on specific dimensions — `LAYOUT`, `COLOR_SCHEME`,
  `IMAGES`, `TEXT_FONT`, `TEXT_CONTENT`, or leave empty for all

#### 3. Present AI Feedback

Always show the text description and suggestions from `outputComponents` to the
user.

#### 4. Download Design Assets

Download the variant HTML and screenshot via Stitch MCP `download_file` (using
`htmlCode.name` and `screenshot.name`) into `.stitch/designs/`. Do **not** use
`curl -o` on `downloadUrl`.

- **Naming**: Use the screen ID or a descriptive slug for the filename.
- **Tools**: `download_file` + `node skills/stitch/stitch-preview/scripts/save-stitch-file.mjs <tool-output> .stitch/designs/{slug}.{html|png}` when output is truncated.
- **Directory**: Ensure `.stitch/designs` exists.

--------------------------------------------------------------------------------

## 💡 Tips

- **Be structural**: Break the page down into header, hero, features, and
  footer in your prompt.
- **Content first**: Describe what each section contains (text, images, CTAs)
  rather than how it looks.
- **Iterative Polish**: Prefer editing for targeted adjustments over full
  re-generation.
- **No theme leakage**: Avoid hex codes or color roles in a generation prompt
  when a design system is active — only add explicit font names when overriding
  an unsupported platform-native font (e.g., SF Pro for iOS).
- **Specify interactions**: Mention hover states, animations, and click behavior
  rather than visual styling.
- **Keep edits focused**: One edit at a time is often better than a long list of
  changes.
- **Reference components**: Use professional terms like "navigation bar", "hero
  section", "footer", "card grid".
- **Precise colors in edits**: Use hex codes for exact color matching when
  editing existing screens.

## 📚 References

- [Design Mappings](references/design-mappings.md) — UI/UX keywords and
  atmosphere descriptors.
- [Prompting Keywords](references/prompt-keywords.md) — Technical terms Stitch
  understands best.
- [Enhanced Prompt Example](examples/enhanced-prompt.md) — Before/after prompt
  enhancement.
