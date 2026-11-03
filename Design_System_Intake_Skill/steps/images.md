# Photos for screens (section 7i)

Part of `Design_System_Intake_Skill` (map in `SKILL.md` section 0c). Load when a screen, a pattern or a component example needs a photo: hero sections, cards, avatars, product shots, empty-state art, backgrounds (Abdul, 2026-11-03). Every `Ask (choice)` here also gets a "Back" option (`SKILL.md` section 0, Back on every menu).

Photos are stock photos from **Unsplash**, free for commercial use (Unsplash License). Nobody needs a paid image tool.

## 7i.1 Which image

- **The source wins.** Brownfield, Scenario C and Code to Design use the image the source shows (the code's asset file, the frame's image fill or a crop of the screenshot). Stock photos are only for what the source leaves empty or marks as a placeholder.
- **Greenfield:** the screen spec (7f) names each image slot with a short query ("doctor talking to a patient, bright clinic"), its size and its mood (from the style or brand, 0.3e). One query per slot, never the same photo twice on a screen.
- **Size:** the slot's frame size. Desktop hero 1440 x 900, Mobile hero 375 x 812 or the section height, cards and avatars their frame size.
- **People and brands:** no logos, readable text or recognizable brands in a photo, and no photo that suggests a real person endorses the product.

## 7i.2 Get the photo

`node tools/stock_image.cjs "<query>" --size <w>x<h> --count 3 --name <slot> --out "My Projects/<Project>/assets/images"`

- With `UNSPLASH_ACCESS_KEY` set it searches Unsplash and follows the API rules by itself: it counts each download and saves the photographer's credit.
- Without the key it uses Lorem Picsum. These are Unsplash photos too, but random: there is no search. The first time there is no key, Ask (choice) once per machine: "Random photos for now (Recommended)" (description: no setup, fine for placeholders) / "Set up a free Unsplash key" (description: real search by subject; about 2 minutes). For the key: the user creates a free app at https://unsplash.com/oauth/applications and copies its Access Key. In their own terminal they run `setx UNSPLASH_ACCESS_KEY "<key>"` (Windows) or add an `export` line to `~/.zshrc` (macOS), then restart Claude Code. Never ask for the key in the chat, and never read or write it.
- Look at the 3 candidates and pick the one that fits the spec and the style; delete the others.

## 7i.3 Put it in Figma

- The image goes on the image layer of an instance (an image slot, or a rectangle or frame named after its role: `Hero Image`, `Card Image`, `Avatar Image`). It never goes on the screen frame, and never as a loose node.
- `node tools/place_image.cjs <file> --file-key <key> --node "<node id>" --name "Hero Image" --credit "<credit from credits.json>"`, then run the printed FigCli `eval --file` command with the file's `FIGMA_FILE` (file check first, `steps/figma-files.md`). Use the node id: a layer name works only when it is unique on the page. Fit: `fill` (default, crops to the frame), `fit` for product shots on a plain background.
- Desktop Bridge only: run the same script through `figma_execute`.
- Overlay text on a photo keeps its contrast through the DS scrim or overlay token, never a raw dark layer (Accessibility floors, decisions.md).

## 7i.4 Credits and the Live Prototype

- `assets/images/credits.json` keeps every photo's credit, page link and size. It is the project's attribution list: the Storybook or Live Prototype shows "Photo by <name> on Unsplash" where the photo appears or in an About / credits page.
- Live Prototype and code: use the `hotlink` URL from `credits.json` (Unsplash asks API apps to hotlink their image URLs) or the saved file in `public/assets/images/`, with the credit as the `alt`/title text.
- CHANGELOG: `Images: <n> stock photos (Unsplash|Lorem Picsum), credits in assets/images/credits.json`.
