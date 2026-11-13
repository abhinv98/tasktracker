// One-off codemod: give every hand-written text button the standard Button's shape and size
// (h-8, px-3, rounded-md, 13px medium), keeping its colours and behaviour.
//   node scripts/uniform-buttons.mjs          dry run: what would change, and what is left alone
//   node scripts/uniform-buttons.mjs --write  apply
// Left alone on purpose: icon-only buttons, tabs, pills, list rows / menu items and link-style buttons,
// which are a different kind of control.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const write = process.argv.includes("--write");
const STANDARD = "h-8 px-3 rounded-md text-[13px] font-medium";
// Size and shape tokens, with or without a breakpoint/state prefix (sm:px-4, hover:px-2).
const SIZE = /(?<![\w\-\[\]:])(?:[a-z0-9\-\[\]&>_.]+:)*(?:px-[\w.\[\]]+|py-[\w.\[\]]+|h-(?:\d[\w.]*|\[[^\]]+\])|min-h-[\w.\[\]]+|text-\[\d+px\]|text-(?:xs|sm|base|lg|xl)|rounded(?:-(?:sm|md|lg|xl|2xl|3xl|none|\[[^\]]+\]))?|font-(?:normal|medium|semibold|bold)|leading-[\w.\[\]]+)(?![\w\-\[\]])/g;

function* tsxFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* tsxFiles(p);
    else if (p.endsWith(".tsx")) yield p;
  }
}

/** Does the button show words (not just an icon)? Text, or an expression that is not obviously an icon. */
function hasWords(el, sf) {
  let words = false;
  const visit = (n) => {
    if (ts.isJsxText(n) && /[A-Za-z]/.test(n.text)) words = true;
    else if (ts.isJsxExpression(n) && n.expression) {
      const src = n.expression.getText(sf);
      // {label}, {saving ? "Saving…" : "Save"}, {t.name}; but not {open ? <ChevronUp/> : <ChevronDown/>}
      if (!/^[\s\S]*<[A-Z]/.test(src) || /["'`][^"'`]*[A-Za-z]{2,}[^"'`]*["'`]/.test(src)) words = true;
    } else if (ts.isJsxElement(n) && !/^[A-Z]/.test(n.openingElement.tagName.getText(sf))) n.children.forEach(visit);
  };
  el.children.forEach(visit);
  return words;
}

const stats = { changed: 0, already: 0, skipped: {} };
const skip = (why) => (stats.skipped[why] = (stats.skipped[why] ?? 0) + 1);
const samples = [];

for (const file of tsxFiles("src")) {
  if (file.includes(`${path.sep}components${path.sep}ui${path.sep}`)) continue; // the standard components themselves
  if (file.includes(`${path.sep}app${path.sep}portal${path.sep}`)) continue; // the client portal has its own look (--p-* tokens)
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const visit = (node) => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(sf) === "button") {
      const attr = node.openingElement.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "className");
      const cls = attr?.initializer?.getText(sf) ?? "";
      const has = (re) => re.test(cls);
      if (!attr) skip("no className (link-style or bare)");
      else if (!hasWords(node, sf)) skip("icon only");
      else if (has(/\brounded-full\b/)) skip("pill");
      else if (has(/\bborder-b-2\b|\bborder-b-\[/)) skip("tab");
      else if (has(/\btext-left\b|\bw-full\b|\bjustify-between\b|\bflex-col\b/)) skip("row, menu item or full-width block");
      else if (has(/\babsolute\b/)) skip("overlay control");
      else if (!has(/(?<![\w-])px-/) || !has(/(?<![\w-])(bg-|border\b|border-)/)) skip("link-style (no padding or no surface)");
      else {
        const start = attr.initializer.getStart(sf);
        const end = attr.initializer.getEnd();
        let first = true;
        // Put the standard set where the first size token was; drop the rest.
        let next = cls.replace(SIZE, () => (first ? ((first = false), STANDARD) : ""));
        // Tidy the gaps the dropped tokens left, and the two ends of the attribute.
        next = next.replace(/(?<=\S)[ \t]{2,}/g, " ").replace(/^(\{?["'`]) /, "$1").replace(/ (["'`]\}?)$/, "$1");
        if (next === cls) stats.already++;
        else {
          edits.push({ start, end, next });
          stats.changed++;
          if (samples.length < 12) samples.push(`${file}\n  - ${cls.replace(/\s+/g, " ").slice(0, 170)}\n  + ${next.replace(/\s+/g, " ").slice(0, 170)}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (write && edits.length) {
    let out = text;
    for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.next + out.slice(e.end);
    fs.writeFileSync(file, out);
  }
}

console.log(samples.join("\n\n"));
console.log(`\n${write ? "changed" : "would change"}: ${stats.changed} buttons | already standard: ${stats.already}`);
console.log("left alone:", stats.skipped);
