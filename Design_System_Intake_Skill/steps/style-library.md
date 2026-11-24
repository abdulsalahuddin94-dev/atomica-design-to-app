# Visual direction from the Style library (intake 0.3e)

Part of `Design_System_Intake_Skill` (map in `SKILL.md` section 0c). Load when 2.1 = Greenfield, right after the path is known and before the 0.3c prefill confirmation (Abdul, 2026-10-19). Every `Ask (choice)` here also gets a "Back" option (`SKILL.md` section 0, Back on every menu).

**Greenfield only.** Brownfield, Scenario C and Code to Design never ask it: their look comes from the source file or code. Not asked either when 3.1 later turns out to be "Yes" (an existing AI-ready DS keeps its own look); if that happens, clear `status.json > style` and say so in one line.

The library: `Style_Library/` (README there). `Style_Library/styles.json` is the index (slug, title, name, category, description, `inspired_by_brand`, file); read the index for the menus and only the one chosen `DESIGN.md` (token budget, section 0c). A style is **look only** (colors, type, radius, density, elevation, mood); the structure (pages, components, variants, properties, docs) always comes from the platform's default reference design system in `references.json`.

## 0.3e.1 Visual direction

Preselected style: when the conversation's first message names one ("Use the style `<slug>` from the Style library", sent by the dashboard's **Use for a new project**), skip this question and 0.3e.2-0.3e.3, say "Style: <title> (picked in the dashboard)" in one line and go to 0.3e.4. Still ask it if the slug is not in `styles.json`.

Ask (choice): "Which visual direction should the design system start from?"
- "My brand files (Recommended)" (description: colors, fonts and mood come from Inputs/Brand and Inputs/Inspiration; shown only when `Inputs/Brand/` has files, and then first)
- "Research and suggest a direction (Recommended)" (description: I look at the product's market and competitors and suggest 2 to 3 styles, each with a brand color and the reason). Shown only when `Inputs/Brand/` is empty, and then first (Abdul, 2026-11-24: a project with no inputs should not pick its look blind).
- "Pick a style from the library" (description: 138 looks in 20 categories; the style sets colors, type, radius and mood, the components keep the reference structure).
- "No style, use defaults" (description: the platform defaults now, the industry direction at 3.4)
- "Back"

- **My brand files** -> nothing is recorded here (`status.json > style` stays null); 0.3c prefills from the files as before.
- **Research and suggest** -> 0.3e.1b.
- **No style** -> `style` stays null; continue with 0.3c / 0.4.
- **Pick a style** -> 0.3e.2.

## 0.3e.1b Direction research and suggestions (Abdul, 2026-11-24)

Light research for the **look only**; users, flows and the IA stay in Discover (`steps/discover.md`), which reuses what this step finds.
1. **Brief.** Read `Research/00-request.md` (written at 0.3b "Don't have inputs") and any files in `Inputs/Inspiration/` and `Inputs/Research/`. No brief yet -> ask the 0.3b typed question first (same text, so the dashboard shows the text box).
2. **Warn, then research.** One line first: this step uses web search and a fair number of tokens (heavy-step warning, `SKILL.md` 0c). Then, with web search and page reading: the product category in the market or country of the brief, and **up to 5 competitors or close products** (direct first, one best-in-class from a nearby category). For each: name, link, main colors, type personality, density, corner style, mood, and what users of that category expect (trust signals, calm vs energetic, data-dense vs simple). Write "not visible" for anything you could not see; never invent. Save `Research/00-direction.md` with `[M<n>]` tags and a Sources list (the Discover tag format, 17.10).
3. **Pick 2 to 3 styles.** From `Style_Library/styles.json` (index only; open only the picked `DESIGN.md` files for their colors and font), choose 2 to 3 styles that fit the category's expectations, and make them differ from each other (e.g. one close to the category's conventions, one that stands out). For each: a **brand color** (the style's primary, or a nearby hue when every competitor already uses it; contrast pre-checked with `tools/new_foundation.py --check-only`) and **one sentence why**, citing the research (`[M2]`, "3 of 5 competitors use navy, so teal stands out").
4. **Show and ask.** Post a short summary of the research (3 to 5 lines: category, competitors, what the look should signal), then Ask (choice): "Which direction fits <Project>?" with the 2 to 3 suggestions (label = style title, description = the brand color and the reason; `preview` = `Colors:` and `Font:` lines, SKILL.md section 0 Previews) + "Back" (returns to 0.3e.1, where the library and the defaults are). A typed answer through Other can name another style or a change ("the second one but warmer").
5. **Record.** The chosen style goes to 0.3e.4 like a picked style; `status.json > style.source = "research"` and `style.brand_color_reason`. The suggestions and the pick go in `Project_Brief.md > 0.3e`. Brand-inspired styles follow 0.3e.5, and the suggested brand color is a placeholder the client may replace.

## 0.3e.2 Category

Show the 20 categories with their counts from `styles.json > categories` in one line in the message, then Ask (choice): "Which kind of look?" with the **3 most relevant categories** for the project (from the project name, the 0.3b inputs, Research and the industry if already known; e.g. a bank -> Fintech & Crypto, Professional & Corporate, Modern & Minimal; a clinic -> Modern & Minimal, Professional & Corporate, Starter) + "Back". Say in the question that any other category from the list is typed in Other. Each option's description: the category's count and two example style names.

## 0.3e.3 Style

Show every style of the chosen category in the message (name and one-line description, "inspired by a brand" marked), then Ask (choice): "Which style?" with the **3 best-fitting styles** of that category (description = its one-line `description`, plus "Inspired by a brand" when `inspired_by_brand`) + "Back". Any other style of the list is typed in Other (its name or slug). Each style option carries a `preview` with its main colors and font (`Colors: ...`, `Font: ...`, SKILL.md section 0 Previews), read from its `DESIGN.md`, so the dashboard shows the look before the pick.

## 0.3e.4 Read the style and map it to our layers

Read `Style_Library/<slug>/DESIGN.md` once and turn it into prefilled answers. Nothing from the file goes into Figma as it is: every value lands in our own layers and scales.
1. **Colors -> Primitives -> Semantics.** Take the style's role colors (primary / accent, neutrals and surfaces, text, status colors, dark-mode palette when it has one).
   - Brand ramp: the primary hex is the `--brand` of `tools/new_foundation.py` (3d), run with `--check-only` first for the contrast pre-check (3b). A second accent that the style uses as a role becomes its own ramp, generated the same way.
   - Neutrals: the generator's gray ramp; when the style's neutrals are clearly tinted (warm paper, cool blue-gray), regenerate the gray ramp from the style's mid neutral with `tools/recolor.py` after the Primitives exist.
   - Semantics alias Primitives only (recolor-ready, Main Skill 3b); the style's surface and text colors pick the nearest steps. Contrast rules are unchanged (text 4.5:1, UI 3:1, every mode); a style color that fails is moved to a passing step and listed.
   - Modes: a style with a dark palette fills the Dark mode from it; otherwise Dark comes from our Semantic mapping. Modes themselves are still the 0.4 answer.
2. **Fonts -> 0.6.** The style's font family prefills 0.6. A proprietary or paid font (most brand styles) is replaced by the free substitute the file names ("Font Substitutes", fallbacks); if it names none, the closest free Google font with the same personality (geometric, humanist, grotesk, serif). Confirm it is available in Figma (0.6). An RTL project (0.5) adds the platform's Arabic default.
3. **Radius, spacing, elevation -> our scales.** Snap each to the nearest step of the platform's scales (Main Skill): the style's corner radius sets the role radius aliases (`radius/role/*`), its spacing feel sets the density (compact / comfortable / spacious), its shadows become our elevation levels (flat / subtle / layered) as effect styles. Never add a step only to match a style.
4. **Direction (3c).** The style's mood, do's and don'ts and imagery notes fill the Direction line (corner style, density, elevation, border use, type personality, icon weight). An icon library the style names may prefill 0.6b only if it is in `tools/icon_libraries.json`.
5. **Structure stays ours.** Components, variants, properties, page layout and docs follow the platform's default reference design system (`references.json`) and the atomic tiers; the style changes only how they look. Never add a component tier or component tokens for a style.

## 0.3e.5 Brand-inspired styles (`inspired_by_brand: true`)

- Always write "inspired by <name>", never "the <name> design system", in the chat, the Brief, Figma and docs.
- Never copy the company's identity: no logos, wordmarks, product names, illustrations, signature imagery or proprietary fonts (use the substitute, step 2).
- **The client's own brand wins (trademark).** When `Inputs/Brand/` or 3.3 gives a brand color, it is the brand ramp and the style's signature color is dropped; the style keeps only neutrals, radius, density, elevation and type personality. Say so in one line. Without a client brand color, propose the style's primary as a starting point and say it is a placeholder the client should replace before launch.

## 0.3e.6 Confirm and record

Merge the style's answers into the 0.3c list (0.3c runs right after this file): one list with each answer and its source (`from Style_Library/<slug>` or `from Inputs/<file>`; brand files win over the style on brand color and fonts), and those answers go into the 0.3s setup card (SKILL.md) with the recommended answers for everything else, under its one "Use all of these" question. The card's preview shows the style's main colors and its font (Previews format, SKILL.md section 0).

Record after "Use all of these":
- `Project_Brief.md > 0.3e`: "Style: <title> (<slug>, <category>), inspired by a brand: yes/no" (or "My brand files" / "No style") and each prefilled answer with its source.
- `status.json > style` = `{"slug", "title", "category", "inspired_by_brand", "file": "Style_Library/<slug>/DESIGN.md", "source": "intake" | "dashboard" | "research"}` (with `"brand_color_reason"` when the source is research, 0.3e.1b).
- The Intake Summary's Direction line starts with `Style: <title>` (and "inspired by" for brand styles).
