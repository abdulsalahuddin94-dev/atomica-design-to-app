// Shared helpers for the hooks. Hooks run with Node.js (already required by Claude Code setup,
// FigCli and Storybook), so a machine without Python never sees a hook error.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

function readInput() {
  try {
    return JSON.parse(fs.readFileSync(0, "utf8") || "{}") || {};
  } catch (e) {
    return null;
  }
}

// Broad Figma write-API pattern: audit_reminder.cjs arms the reminder only for scripts that match,
// guard_figma.cjs denies it in read-only scripts.
const WRITE = new RegExp(
  String.raw`\.(remove|setValueForMode|setBoundVariable|setProperties|appendChild|insertChild|resize|resizeWithoutConstraints|` +
  String.raw`swapComponent|setPluginData|setSharedPluginData|addComponentProperty|editComponentProperty|` +
  String.raw`deleteComponentProperty|setExplicitVariableModeForCollection|setRangeFills|setRangeTextStyleId|` +
  String.raw`setFillStyleIdAsync|setTextStyleIdAsync|setEffectStyleIdAsync|combineAsVariants|createInstance|` +
  String.raw`setReactionsAsync|setVariableCodeSyntax|renameMode|addMode|removeMode)\s*\(|` +
  String.raw`\.(name|fills|strokes|effects|characters|description|x|y|visible|opacity|locked|rotation|` +
  String.raw`cornerRadius|topLeftRadius|topRightRadius|bottomLeftRadius|bottomRightRadius|cornerSmoothing|` +
  String.raw`itemSpacing|counterAxisSpacing|padding\w*|layoutMode|layoutWrap|layoutAlign|layoutGrow|` +
  String.raw`layoutPositioning|layoutSizingHorizontal|layoutSizingVertical|primaryAxisSizingMode|` +
  String.raw`counterAxisSizingMode|primaryAxisAlignItems|counterAxisAlignItems|clipsContent|strokeWeight|` +
  String.raw`strokeAlign|dashPattern|fontName|fontSize|lineHeight|letterSpacing|textAutoResize|` +
  String.raw`textAlignHorizontal|textAlignVertical|fillStyleId|strokeStyleId|effectStyleId|textStyleId|` +
  String.raw`gridStyleId|componentPropertyReferences|constraints|minWidth|maxWidth|minHeight|maxHeight|` +
  String.raw`scopes|hiddenFromPublishing|expanded|resolvedType|currentPage)\s*=[^=]|` +
  String.raw`figma\.(create\w+|variables\.create\w+|group|flatten|union|subtract|intersect|exclude)\s*\(`
);

// Code that a FigCli Bash command sends to Figma: the inline eval string, plus the script of
// `eval --file <path>` (resolved against the command's cwd and the Root).
function figcliCode(cmd, cwd) {
  let code = "";
  const file = cmd.match(/\beval\s+--file\s+("([^"]+)"|'([^']+)'|(\S+))/);
  if (file) {
    const f = file[2] || file[3] || file[4];
    for (const base of [cwd || process.cwd(), ROOT]) {
      try { code = fs.readFileSync(path.resolve(base, f), "utf8"); break; } catch (e) { /* try next */ }
    }
  } else {
    const inline = cmd.match(/\beval\s+([\s\S]*)$/);
    if (inline) code = inline[1].replace(/^\s*["']|["']\s*$/g, "");
  }
  return code;
}

module.exports = { readInput, WRITE, figcliCode };
