// No hover on mobile (Abdul, 2026-10-28): phones and tablets have no pointer, so in a mobile project the DS styles'
// :hover rules are dropped from the page (whichever way they were loaded: imports, @import, Tailwind); their Pressed
// (:active) rules stay the tap feedback. The shell's own Tailwind hover: classes (outside the device, desktop pointer)
// keep their hover; they are the selectors with an escaped colon (.hover\:...).
declare const __ATOMICA_MOBILE__: boolean;

function splitSelectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of list) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

function clean(rules: CSSRuleList, owner: CSSStyleSheet | CSSGroupingRule): number {
  let dropped = 0;
  for (let i = rules.length - 1; i >= 0; i--) {
    const r = rules[i];
    if (r instanceof CSSStyleRule) {
      if (!/:hover\b/.test(r.selectorText)) continue;
      const keep = splitSelectors(r.selectorText).filter((s) => !/:hover\b/.test(s) || s.includes('\\:'));
      if (keep.length === splitSelectors(r.selectorText).length) continue;
      dropped++;
      if (keep.length) r.selectorText = keep.join(','); else owner.deleteRule(i);
    } else if ('cssRules' in r) {
      dropped += clean((r as CSSGroupingRule).cssRules, r as CSSGroupingRule);
    }
  }
  return dropped;
}

export function dropDsHover(): number {
  let dropped = 0;
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; } // another origin
    dropped += clean(rules, sheet);
  }
  return dropped;
}

// Run once the styles are in, and again whenever a stylesheet is added or replaced (lazy screens, hot reload).
export function noHoverOnMobile() {
  if (!__ATOMICA_MOBILE__) return;
  const run = () => { document.documentElement.dataset.hoverDropped = String(dropDsHover()); };
  run();
  new MutationObserver(run).observe(document.head, { childList: true, subtree: true, characterData: true });
  // a lazily loaded screen adds a <link>: its rules exist only once it has loaded
  document.addEventListener('load', (e) => { if ((e.target as Element)?.tagName === 'LINK') run(); }, true);
}
