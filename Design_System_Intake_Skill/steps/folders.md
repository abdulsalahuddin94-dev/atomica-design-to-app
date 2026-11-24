# Folder conventions

Part of `Design_System_Intake_Skill` (sections keep their original numbers, so "section 7c" etc. still resolve; the map is in `SKILL.md` section 0c). Load at question 0.3 (creating the project folder) or when unsure where a file goes. Every `Ask (choice)` / `Ask (multi)` here also gets a "Back" option (`SKILL.md` section 0, Back on every menu).

## 10. Folder conventions

```
<Root>\                                    (Main Skills only)
├─ CLAUDE.md                                (tells Claude to start with this skill)
├─ README.md, References.md                 (setup steps, reference library; index in references.json)
├─ .claude\skills\                          (slash commands pointing to the Main Skills)
├─ .claude\agents\, hooks\, settings.json   (subagents, QA hooks, permissions)
├─ memory\MEMORY.md                        (shared project memory, imported by CLAUDE.md)
├─ Storybook_Design_System_Skill\SKILL.md  (optional live Storybook)
├─ tools\                                   (build_tokens.py, recolor.py, ds_color.py)
├─ Design_System_Intake_Skill\SKILL.md      (this skill, runs first)
├─ Web_Design_System_Skill\SKILL.md
├─ iOS_Design_System_Skill\SKILL.md
├─ Android_Design_System_Skill\SKILL.md
└─ My Projects\                            (every project; README.md explains how to add one)
   ├─ _Project_Template\                   (copied for each new project, never edited per project)
   └─ <Project>\                           (Web)   | <Project>_iOS\ | <Project>_Android\ | <Project>_Mobile\ (Both, cross-platform or Mobile Adaptive) | <Project>_Brand\ (Both native, optional Brand Foundation)
      ├─ Project_Brief.md                      (intake answers, links, decisions)
      ├─ CHANGELOG.md                          (dated Figma changes, each marked Storybook synced yes/no)
      ├─ status.json                           (last change, unsynced count, last Storybook sync; tools/project_status.py)
      ├─ Inputs\
      │  ├─ Brand\                             (brand book PDF, logo, images, mood board)
      │  ├─ Inspiration\                       (reference screenshots, links)
      │  ├─ Screens\                           (screenshots of existing UI)
      │  ├─ Research\                          (research, personas, PRDs, notes about the product)
      │  ├─ Extracted_Tokens.md                (Brownfield type 1, Code to Design)
      │  └─ Code_Inventory.md                  (Code to Design, Scenario D)
      ├─ data\                                 (tokens.json, component-registry.json, rules.json, screen-templates.json, source\, recolor\)
      ├─ docs\decisions.md                     (why each decision was made; recolor log)
      ├─ audits\                              (ds-auditor reports)
      ├─ Screenshots\                         (one folder per phase, 1-Intake ... 7-Storybook: the checkpoint screenshots, copied there by Claude, and any the user takes; for reviews and presentations)
      ├─ storybook\                           (optional live Storybook, section 12)
      ├─ Foundation_Skill\SKILL.md + references\ (variables.md, gaps.md, screens\)
      └─ Component_Skills\
         ├─ Form_Elements_Skill\               (anything the user enters data with)
         ├─ Navigation_Skill\                  (actions, buttons, links, tabs, anything that moves between places)
         └─ Data_Display_Skill\                (anything that displays information)
            each: SKILL.md + references\ (components.md, gaps.md, screens\)
```

- New project folders are copies of `My Projects\_Project_Template\`. Each can become its own private Git repo, separate from the workflow repo (see `My Projects\README.md`); never create or push one without asking. Team projects (0.3d) are always one repo that also holds the Storybook (`steps/team.md`).
- Root tools take the project folder relative to the Root, quoted: `python tools/build_tokens.py "My Projects/<Project>"`.
- One folder per platform: "Both" + Native creates `<Project>_iOS\` and `<Project>_Android\`, each with its own full skill set (and `<Project>_Brand\` with `Project_Brief.md`, `status.json` and `data\tokens.json` Primitives when the Brand Foundation is chosen). "Both" + Cross-platform creates one `<Project>_Mobile\`.
- Group routing for new components and pages (Figma and skills): foundations (including ➜ App Icon) -> ⭐Setup / Foundation_Skill; data entry -> ⭐Form Elements; actions and navigation -> ⭐Navigation; information display -> ⭐Data Display. Create a new `➜` page in the matching group when no page fits.
- Figma file names: `<Project> Design System` for the library, `<Project>` for screens. Both + Native: `<Project> iOS Design System`, `<Project> Android Design System`, `<Project> iOS`, `<Project> Android`, optional `<Project> Brand Foundation`. Page structure follows the platform Main Skill (Cover, ⭐Setup, ⭐ groups with ➜ topic pages).

