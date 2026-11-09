// Audit (on request): Review design or Challenge the plan for one project. The dialog only collects the choices and
// sends one prompt to the project's conversation; the rules live in Workflow_References/ai-review/README.md.
"use strict";

const AUDIT_DOC = "Workflow_References/ai-review/README.md";
const AUDIT_PERSONAS = [
  ["Frustrated User", "Friction, clarity, effort", true],
  ["Accessibility Expert", "WCAG 2.2, inclusive design", true],
  ["UI/UX Expert", "Hierarchy, interaction, structure", true],
  ["Stakeholder", "Business, conversion", false],
  ["Developer", "Feasibility, maintenance", false],
  ["Competitor", "Positioning, parity", false],
  ["Growth Marketing", "Activation, retention", false],
];
const AUDIT_REVIEW_SUBJECTS = {
  screens: ["Current screens", "The screens in this project's Design file"],
  prototype: ["Prototype", "This project's live prototype"],
  source: ["A Figma link or screenshots", "Paste a link, attach images, or both"],
};
const AUDIT_CHALLENGE_SUBJECTS = {
  brief: ["Project brief", "Project_Brief.md"],
  flow: ["Flow map", "The latest flow map"],
  spec: ["A screen spec", "Name the screen below"],
  components: ["Component list", "The planned or gap-table components"],
  text: ["Free text", "A decision or idea, in your words"],
};

// Pure: the choices -> { short (the line shown in the chat), full (the instructions) }.
function auditPrompt(project, c) {
  const head = (label) => `Audit on request (${label}) for the project "${project}" (My Projects/${project}). Follow ${AUDIT_DOC}.`;
  const loadSkill = (name, extra = "") => `Load the ${name} skill; if it is not listed, read .claude/skills/${name}/SKILL.md${extra} directly.`;
  const close = "Report only: save the report under the project's audits/ folder as that document says, then show the fixes as a multi-select menu. Change nothing in Figma, code or project files until I pick. Menus in English, the report in my language.";
  if (c.mode === "review") {
    const subject = c.subject === "source"
      ? `the design at ${c.detail || "the attached screenshots"}${c.detail && c.images?.length ? ", and the attached screenshots" : ""}`
      : c.subject === "prototype" ? "this project's live prototype" : "the current screens in this project's Design file";
    return {
      short: `Audit: Review design (${c.personas.join(", ")})`,
      full: [head("Review design"), loadSkill("design-audit-panel", " and references/personas.md"), `Perspectives: ${c.personas.join(", ")}.`, `Subject: ${subject}.`, close].join("\n"),
    };
  }
  const subjects = { brief: "the project's Project_Brief.md", flow: "the project's latest flow map", components: "the project's planned component list (or its latest gap table)" };
  const subject = c.subject === "spec" ? `the screen spec for "${c.detail}"` : c.subject === "text" ? `this plan, in my words:\n"""\n${c.detail}\n"""` : subjects[c.subject];
  const pitch = c.pitch ? "Include the Final narrative." : "Run Phase 1 and Phase 2 and skip the Final narrative.";
  return {
    short: `Audit: Challenge the plan (${AUDIT_CHALLENGE_SUBJECTS[c.subject][0]})`,
    full: [head("Challenge the plan"), loadSkill("devils-advocate-and-convincer"), pitch, `Subject: ${subject}`, close].join("\n"),
  };
}

// run({ short, full, images }) sends it to the project's conversation.
function openAuditDialog(project, run) {
  const name = project.title || project.name;
  const images = [];
  const option = (type, group, value, label, hint, checked) => el("label", { class: "check" },
    el("input", { type, name: group, value, checked }),
    el("span", {}, label, hint ? el("small", {}, hint) : null));
  const set = (legend, ...kids) => el("fieldset", { class: "audit-set" }, el("legend", {}, legend), ...kids);
  const options = (group, map, first) => Object.entries(map).map(([k, [l, d]]) => option("radio", group, k, l, d, k === first));

  const reviewDetail = el("input", { type: "text", dir: "auto", "aria-label": "Figma link", placeholder: "https://www.figma.com/design/…" });
  const thumbs = el("div", { class: "attachments" });
  const drawThumbs = () => { thumbs.replaceChildren(...images.map((src, i) => el("figure", {}, el("img", { src, alt: "Screenshot to review" }),
    el("button", { type: "button", "aria-label": "Remove", onclick: () => { images.splice(i, 1); drawThumbs(); refresh(); } }, icon("i-x"))))); };
  const file = el("input", { type: "file", accept: "image/png,image/jpeg,image/gif,image/webp", multiple: true, hidden: true, onchange: (ev) => {
    for (const f of ev.target.files) { const r = new FileReader(); r.onload = () => { images.push(r.result); drawThumbs(); refresh(); }; r.readAsDataURL(f); }
    ev.target.value = "";
  } });
  const sourceBox = el("div", { class: "audit-detail" }, reviewDetail,
    el("label", { class: "ghost sm audit-attach" }, file, icon("i-clip"), "Attach screenshots"), thumbs);
  const specName = el("input", { type: "text", dir: "auto", "aria-label": "Screen name", placeholder: "Screen name" });
  const freeText = el("textarea", { rows: "4", dir: "auto", "aria-label": "The plan or decision to challenge", placeholder: "What are you about to decide? (Arabic or English)" });
  const pitch = option("checkbox", "pitch", "1", "Also write a final pitch", "A short spoken summary after the solutions", false);

  const review = el("div", { class: "audit-panel" },
    set("Panel", el("div", { class: "audit-grid" }, AUDIT_PERSONAS.map(([l, d, on]) => option("checkbox", "persona", l, l, d, on)))),
    set("What to review", ...options("review-subject", AUDIT_REVIEW_SUBJECTS, "screens"), sourceBox));
  const challenge = el("div", { class: "audit-panel" },
    set("What to challenge", ...options("challenge-subject", AUDIT_CHALLENGE_SUBJECTS, "brief"), specName, freeText), pitch);

  const hint = el("p", { class: "note", role: "status" });
  const runBtn = el("button", { type: "submit", class: "primary" }, "Run");
  const form = el("form", { class: "ask-form", method: "dialog" },
    el("h3", {}, "Audit"),
    el("p", { class: "muted" }, `Get a second opinion on ${name}. Claude reports only: nothing changes until you pick the fixes.`),
    el("div", { class: "audit-modes" },
      option("radio", "mode", "review", "Review design", "An expert panel looks at the screens", true),
      option("radio", "mode", "challenge", "Challenge the plan", "Objections and solutions before you approve", false)),
    review, challenge, hint,
    el("div", { class: "ask-buttons" }, el("button", { type: "button", class: "ghost", onclick: () => dlg.close() }, "Cancel"), runBtn));
  const dlg = el("dialog", { class: "ask audit-dlg" }, form);

  const val = (group) => form.querySelector(`input[name="${group}"]:checked`)?.value;
  const choices = () => {
    if (val("mode") === "review") {
      const subject = val("review-subject");
      return { mode: "review", subject, personas: [...form.querySelectorAll('input[name="persona"]:checked')].map((i) => i.value), detail: subject === "source" ? reviewDetail.value.trim() : "", images: subject === "source" ? images : [] };
    }
    const subject = val("challenge-subject");
    return { mode: "challenge", subject, pitch: form.querySelector('input[name="pitch"]').checked, detail: subject === "spec" ? specName.value.trim() : subject === "text" ? freeText.value.trim() : "", images: [] };
  };
  const missing = (c) => c.mode === "review"
    ? (!c.personas.length ? "Pick at least one perspective." : c.subject === "source" && !c.detail && !c.images.length ? "Paste a link or attach a screenshot." : "")
    : (c.subject === "spec" && !c.detail ? "Name the screen." : c.subject === "text" && !c.detail ? "Write the plan to challenge." : "");
  function refresh() {
    const isReview = val("mode") === "review";
    review.hidden = !isReview; challenge.hidden = isReview;
    sourceBox.hidden = val("review-subject") !== "source";
    specName.hidden = val("challenge-subject") !== "spec";
    freeText.hidden = val("challenge-subject") !== "text";
    const m = missing(choices());
    hint.textContent = m; runBtn.disabled = !!m;
  }
  form.addEventListener("input", refresh);
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const c = choices();
    if (missing(c)) return;
    dlg.close();
    run({ ...auditPrompt(project.name, c), images: c.images });
  });
  dlg.addEventListener("close", () => dlg.remove());
  document.body.append(dlg);
  refresh();
  dlg.showModal();
}
