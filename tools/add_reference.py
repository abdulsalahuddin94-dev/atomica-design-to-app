"""Add a studied design system to the reference library (references.json) and scaffold its folder.

Usage:
  python tools/add_reference.py --company "Acme" --platform web --name "Acme - Web Design System" \
      --figma-url https://www.figma.com/design/<KEY>/... [--github-url https://github.com/<org>/<repo>] [--default]

Platforms: web, ios, android, cross-platform. Creates Reference_Library/<Company>/<Platform>/ with the same
layout as the existing entries (Foundation_Skill, Component_Skills per group, data/, docs/), registers the
original file key as off-limits (the guard hook asks before any write to it) and adds the entry to
references.json. The Figma link is required (a reference without a public Figma file is not a structure
reference); the GitHub (code) link is optional. Refuses an id that already exists. The study itself (filling the skills and data from
Figma) follows References.md > "Adding a design system" (/study-reference-ds).
"""
import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PLATFORM_DIR = {"web": "Web", "ios": "iOS", "android": "Android", "cross-platform": "Cross_Platform"}
MAIN_SKILL = {"web": "Web_Design_System_Skill", "ios": "iOS_Design_System_Skill",
              "android": "Android_Design_System_Skill", "cross-platform": "Web_Design_System_Skill"}
GROUPS = {"Form_Elements_Skill": "Form Elements", "Navigation_Skill": "Navigation",
          "Data_Display_Skill": "Data Display"}


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def file_key(url):
    m = re.search(r"figma\.com/(?:design|file)/([A-Za-z0-9]+)", url)
    if not m:
        sys.exit(f"Not a Figma design link: {url}")
    return m.group(1)


def github_url(url):
    if not re.match(r"https://github\.com/[^/\s]+/[^/\s]+", url):
        sys.exit(f"Not a GitHub repository link: {url}")
    return url


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(text, encoding="utf-8")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--company", required=True)
    p.add_argument("--platform", required=True, choices=list(PLATFORM_DIR))
    p.add_argument("--name", required=True, help="Figma file name, shown to users in the intake menu")
    p.add_argument("--figma-url", required=True)
    p.add_argument("--github-url", help="optional code repo: exact token values, prop names, states, accessibility")
    p.add_argument("--source", choices=["figma", "built-from-code"], default="figma",
                   help="built-from-code: the Figma file was built by us from the code, not the original team's")
    p.add_argument("--default", action="store_true", help="make it the platform's default reference")
    a = p.parse_args()

    refs_path = ROOT / "references.json"
    refs = json.loads(refs_path.read_text(encoding="utf-8"))
    eid = f"{slug(a.company)}-{a.platform}"
    if any(e["id"] == eid for e in refs["entries"]):
        sys.exit(f"Entry {eid} already exists in references.json")
    key = file_key(a.figma_url)
    gh = github_url(a.github_url) if a.github_url else None
    company_dir = re.sub(r"[^A-Za-z0-9]+", "_", a.company).strip("_")
    folder = f"Reference_Library/{company_dir}/{PLATFORM_DIR[a.platform]}"
    base = ROOT / folder
    if base.exists() and any(base.iterdir()):
        sys.exit(f"{folder} already exists and is not empty")

    main_skill = MAIN_SKILL[a.platform]
    write(base / "Foundation_Skill" / "SKILL.md",
          f"# Foundation_Skill - {a.name}\n\n"
          f"Study of the reference file's ⭐Setup group: file structure (pages and order), Primitives, Semantics "
          f"(modes), spacing, radius, typography variables, text and effect styles, icons. Platform rules: "
          f"`{main_skill}/SKILL.md`.\n\n> Status: not studied yet.\n")
    write(base / "Foundation_Skill" / "references" / "variables.md", "# Variables\n\n> Not studied yet.\n")
    write(base / "Foundation_Skill" / "references" / "gaps.md", "# Gaps\n\n> Not studied yet.\n")
    for skill, group in GROUPS.items():
        d = base / "Component_Skills" / skill
        write(d / "SKILL.md",
              f"# {skill} - {a.name}\n\nComponents of the ⭐{group} group: purpose, variants, properties, "
              f"states, usage rules, accessibility. Load `../../Foundation_Skill/SKILL.md` first.\n\n"
              f"> Status: not studied yet.\n")
        write(d / "references" / "components.md", "# Components\n\n> Not studied yet.\n")
        write(d / "references" / "gaps.md", "# Gaps\n\n> Not studied yet.\n")
    rules = {
        "meta": {"source": f"{main_skill}/SKILL.md + {folder}/Foundation_Skill", "entry": eid},
        "off_limits": {"original_template_file_keys": {key: a.name}},
    }
    write(base / "data" / "rules.json", json.dumps(rules, indent=2, ensure_ascii=False) + "\n")
    write(base / "data" / "source" / ".gitkeep", "")
    write(base / "docs" / "decisions.md", f"# Decisions - {a.name}\n\nWhat this reference does and why, "
          f"recorded while studying it.\n")

    refs["entries"].append({
        "id": eid, "company": a.company, "name": a.name, "platform": a.platform, "folder": folder,
        "figma_file_key": key, "figma_url": a.figma_url, "github_url": gh, "source": a.source,
        "storybook": None, "status": "studying",
    })
    if a.default or not refs["default"].get(a.platform):
        refs["default"][a.platform] = eid
    refs_path.write_text(json.dumps(refs, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Added {eid} -> {folder}" + (" (platform default)" if refs["default"][a.platform] == eid else ""))
    print("Next: study it (References.md > Adding a design system), then set status to \"ready\".")


if __name__ == "__main__":
    main()
