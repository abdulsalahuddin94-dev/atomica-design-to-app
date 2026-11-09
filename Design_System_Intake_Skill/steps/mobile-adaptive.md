# Mobile "Both": Mobile Adaptive (Native, one file)

Part of `Design_System_Intake_Skill` (section 1.6; the map is in `SKILL.md` section 0c). Load only when 1.3 = "Mobile Adaptive (Native, one file)". Every `Ask (choice)` / `Ask (multi)` here also gets a "Back" option (`SKILL.md` section 0, Back on every menu).
Proven by a pilot project (Abdul, 2026-10-05): 263 variables, 10 of 11 components with zero platform variants, Settings screen correct in iOS / Android x Light / Dark x EN / AR, audit 0.

iOS and Android (and optionally EN / AR) live in ONE DS file. Each component exists once; the platform look comes only from variable modes set on a frame. Use the iOS and Android Main Skills as the reference for the values of each OS mode (HIG names, Dynamic Type, SF Symbols / M3 type scale, `md.sys` roles, Material Symbols).

## 1. Collections

| Collection | Modes | Holds |
|---|---|---|
| Primitives | one | Raw values: color ramps, `Color/Transparent`, number scale |
| Color | Light, Dark | Semantic colors shared by both platforms, alias Primitives only |
| Language | EN (+ AR) | Font family and size / line height per platform role and language; `Direction/Is LTR`, `Direction/Is RTL` (EN true/false, AR false/true) |
| OS | iOS, Android | Only what differs by platform: type roles (alias Language), spacing, radius, heights, surface aliases, `Platform/Is iOS`, `Platform/Is Android`, `Platform/Name` (string) |
| Component Specific | one | `<Component>/<Property>` tokens, every one an alias to an OS token. Allowed as an exception in this setup only: OS stays the single platform switch |

Chain: layer -> (Component Specific ->) OS -> Language -> value. The binding never changes; the frame's OS, Color and Language modes do.
Code syntax on every variable: SwiftUI for iOS, Jetpack Compose / M3 for Android.

## 2. Components
- **No Hover on mobile (Abdul, 2026-10-28):** phones and tablets have no pointer, so mobile components (Android, iOS, cross-platform, Mobile Adaptive) have no Hover / Hovered state or variant; tap feedback is the Pressed state (Android: state layer / ripple; iOS: highlighted, pressed opacity), plus Focused where the platform has keyboard focus. Hover is for Web (and desktop pointers) only. Check: `node tools/check_no_hover.cjs "My Projects/<Project>"` (0 findings).
- One component per thing. Light / Dark, platform and language come only from modes: never variants, never hard-coded colors.
- Token first. A variant only when the anatomy really changes. Then build a private set `_<Component> Platform` (Platform=iOS|Android) and a published wrapper whose nested `Platform` variant property is bound to `Platform/Name` (this binding works).
- Platform-only parts (iOS chevron and inset separator, Android floating label, M3 selected check) are layers with visibility bound to `Platform/Is iOS` / `Is Android`.
- Icons: one component per meaning with two glyph layers (SF Symbol, visible on Is iOS; Material Symbol, visible on Is Android), color bound to icon tokens; directional icons (chevron, back) carry both directions.
- iOS "no shadow": the effect stays and its color is bound to a token that is transparent on iOS (Figma has no variable for effect presence).

## 3. RTL (EN + AR)
- Figma has no variable for layout direction, auto layout order or text alignment. Any row whose order flips exists twice: `<Row> LTR` and `<Row> RTL`, visibility bound to `Direction/Is LTR|RTL`; the RTL row has the parts reversed and its texts right-aligned. Text-only rows use spacers bound to direction.
- Bind direction visibility **after** the row's content is added (a frame hidden while empty stays 100x100 when a mode shows it). Never wrap a single element that a property can hide (an all-hidden hug frame keeps its size); hide that element by its property inside the direction row.
- A layer's visibility takes one source (a property or a variable): property on the element, direction on the row.
- Text, boolean and swap properties are wired to both copies. Exposed nested instances exist once per direction.
- No direction variants. Spacers and insets are auto layout frames.

## 4. Pages and checks
- Component pages show only the main component or set. Mode demos only on ⭐Setup > ➜ Platform Preview: instances in frames that change only OS, Color and Language (iOS / Android x Light / Dark x EN / AR).
- Screens: one screen pattern, shown in mode frames. Rebuilds never delete user sections; re-point instances after a main component is rebuilt.
- Audit adds: 0 component sets with Light/Dark, platform or direction variant properties (except private `_... Platform` sets), 0 unbound fills, every Component Specific token aliases OS.

## 5. Record
- `status.json`: `mobile_setup: mobile-adaptive`, no `sibling_project`, one `figma.design_system`. Folder `<Project>_Mobile\`.
