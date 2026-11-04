// Quality rules checked on every Figma write script BEFORE it runs (called from guard_figma.cjs, so it
// costs no extra process). Static checks on the script text only, no Figma call:
//
//   raw-color    a literal color (hex, {r,g,b}, figma.util.rgb) with no variable binding in the script
//   raw-font     fontSize / fontName / lineHeight / letterSpacing set by hand with no text style or
//                bound typography variable
//   layer-names  nodes created without a name, or named like Figma defaults ("Frame 12", "Rectangle 3")
//   screen-size  a screen frame resized under the floor: Desktop 1440 x 900, Mobile 375 x 812
//   mobile-hover a Hover state or variant written in a mobile file (iOS / Android / mobile project) or
//                next to a 375-wide screen
//
// A script that must break a rule on purpose (a temporary capture frame, a scrim) starts a line with
//   // allow: <rule> <reason>        e.g.  // allow: raw-color temporary capture frame, deleted below
// The rule is then skipped and the reason is shown in the transcript. Rules: memory/decisions.md >
// Automatic checks.
const { projectFor } = require("./_projects.cjs");

const LIT_COLOR = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|\bcolor\s*:\s*\{\s*r\s*:|figma\.util\.(rgb|rgba|solidPaint)\s*\(/i;
const BINDS_COLOR = /setBoundVariableForPaint|setBoundVariableForEffect|boundVariables|DS\.(paint|bind\w*|fill\w*|stroke\w*)\s*\(|setFillStyleIdAsync|setStrokeStyleIdAsync|fillStyleId\s*=|strokeStyleId\s*=/;
const COLOR_WRITE = /\.(fills|strokes)\s*=[^=]|setRangeFills\s*\(/; // effect and grid colors are not checked
const RAW_FONT = /\.(fontSize|lineHeight|letterSpacing)\s*=\s*(\d|\{)|setRange(FontSize|LineHeight|LetterSpacing)\s*\(/;
const BINDS_FONT = /setTextStyleIdAsync|textStyleId\s*=|setRangeTextStyleId|setBoundVariable\(\s*["'](fontSize|fontFamily|fontWeight|fontStyle|lineHeight|letterSpacing)|DS\.(text\w*|type\w*|bind\w*)\s*\(/;
const CREATE = /figma\.create(Frame|Rectangle|Ellipse|Line|Vector|Polygon|Star|Component|Section|AutoLayout)\s*\(/g;
const NAMED = /\.name\s*=[^=]|\bname\s*:\s*["'`]|DS\.\w+\(\s*["'`]/g;
const DEFAULT_NAME = /\.name\s*=\s*["'`](Frame|Rectangle|Ellipse|Group|Vector|Line|Polygon|Star|Component|Section|Text|Instance)( \d+)?["'`]/;
const HOVER = /State\s*=\s*Hover|["'`]Hover["'`]|\bhover\b\s*:/i;

function allowed(code, rule) {
  const m = code.match(new RegExp(String.raw`//\s*allow:\s*${rule}\b[^\n]*`, "i"));
  return m ? m[0] : null;
}

// Returns null when the script passes, else { reason, allowed: [...] }.
function check(code, ctx) {
  const problems = [];
  const notes = [];
  const rule = (id, failed, text) => {
    if (!failed) return;
    const a = allowed(code, id);
    if (a) notes.push(a.trim()); else problems.push(`${id}: ${text}`);
  };

  rule("raw-color", COLOR_WRITE.test(code) && LIT_COLOR.test(code) && !BINDS_COLOR.test(code),
    "this script writes a literal color and binds no variable. Bind every fill, stroke and effect to a " +
    "Semantic variable (setBoundVariableForPaint / DS.paint); a missing token is proposed for approval, " +
    "never typed as hex.");

  rule("raw-font", RAW_FONT.test(code) && !BINDS_FONT.test(code),
    "font size / line height / letter spacing are set by hand. Apply the text style " +
    "(setTextStyleIdAsync) or bind the Typography variables instead.");

  const creates = (code.match(CREATE) || []).length;
  const names = (code.match(NAMED) || []).length;
  rule("layer-names", DEFAULT_NAME.test(code) || creates > names,
    `${creates} node(s) created but only ${names} name(s) set, or a default name like "Frame 12" is used. ` +
    "Give every created node a meaningful name (Button Label, Input Helper Text).");

  // only scripts that make screens (a frame named Screen / Desktop / Mobile / Page), not components
  const screens = /\.name\s*=[^;\n]*\b(Screen|Desktop|Mobile|Page)\b/i.test(code) && !/figma\.createComponent\s*\(/.test(code);
  const small = [];
  for (const m of code.matchAll(/resize(?:WithoutConstraints)?\(\s*(1440|375)\s*,\s*(\d+)\s*\)/g)) {
    const w = +m[1], h = +m[2];
    if ((w === 1440 && h < 900) || (w === 375 && h < 812)) small.push(`${w} x ${h}`);
  }
  rule("screen-size", screens && small.length > 0,
    `screen frame resized to ${small.join(", ")}. Screens are at least 1440 x 900 (Desktop, default ` +
    "1024) or 375 x 812 (Mobile); keep the floor even when the content is shorter.");

  const mobile = (ctx.project && ctx.project.platform === "mobile") ||
    /\b(iOS|Android|Mobile)\b/.test(ctx.fileName || "") || /resize\(\s*375\s*,/.test(code);
  rule("mobile-hover", mobile && HOVER.test(code),
    "Hover is written in a mobile file or a 375-wide screen. Touch screens have no hover: use " +
    "Default / Pressed / Focused / Disabled.");

  if (!problems.length) return notes.length ? { reason: null, allowed: notes } : null;
  return {
    reason: "Atomica quality check stopped this Figma script before it ran:\n- " + problems.join("\n- ") +
      "\nFix the script and run it again. Only when the rule must be broken on purpose, add a line " +
      "`// allow: <rule> <reason>` and tell the user why.",
    allowed: notes,
  };
}

// ctx from a tool call: the target file and its project (status.json), when known.
function context(target) {
  let project = null;
  try { project = projectFor(target); } catch (e) { /* no projects */ }
  return { project, fileName: (target && target.name) || "" };
}

module.exports = { check, context };
