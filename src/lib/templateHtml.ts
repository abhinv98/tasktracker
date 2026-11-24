// Email templates are stored as the HTML that gets emailed, with {{fields}}
// filled in per candidate (convex/recruitment.ts fillPlaceholders). Nobody
// should have to read that HTML: these functions turn it into something the
// editor and the previews can show, and back again.
//
// Everything that reaches the screen goes through `clean`, which rebuilds the
// markup from a short list of tags. A template is written by one person and
// shown to others, so nothing in it is trusted.

/** What can be filled in, in the order the editor offers it. Keys match fillPlaceholders. */
export const TEMPLATE_FIELDS = [
  { key: "name", label: "Candidate name", sample: "Priya Sharma" },
  { key: "position", label: "Position applied for", sample: "Visual Designer" },
  { key: "jobname", label: "Role", sample: "Visual Designer" },
  { key: "email", label: "Candidate email", sample: "priya@example.com" },
  { key: "number", label: "Candidate phone", sample: "98765 43210" },
  { key: "currentctc", label: "Current CTC", sample: "6 LPA" },
  { key: "expectedctc", label: "Expected CTC", sample: "8 LPA" },
  { key: "resume", label: "Resume link", sample: "Resume link" },
  { key: "portfoliolink", label: "Portfolio link", sample: "Portfolio link" },
] as const;

export type FieldValues = Partial<Record<string, string>>;

/** Sample values, for a preview before anyone is picked. */
export const SAMPLE: FieldValues = Object.fromEntries(TEMPLATE_FIELDS.map((f) => [f.key, f.sample]));

/** The values a real candidate fills in, as the server does it. Without `pay` the
 *  person looking may not see what they earn: the email itself still says it. */
export const valuesFor = (
  c: { name: string; email: string; number: string; position: string; currentCtc: string; expectedCtc: string; resume: string; portfolioLink: string },
  jobName: string,
  pay: boolean
): FieldValues => ({
  name: c.name,
  email: c.email,
  number: c.number,
  position: c.position || jobName,
  jobname: jobName,
  currentctc: pay ? c.currentCtc : "(hidden from you)",
  expectedctc: pay ? c.expectedCtc : "(hidden from you)",
  resume: c.resume,
  portfoliolink: c.portfolioLink,
});

const FIELD = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;
const labelOf = (key: string) => TEMPLATE_FIELDS.find((f) => f.key === key.toLowerCase())?.label;

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

const TAGS: Record<string, string> = {
  P: "p", DIV: "p", H1: "p", H2: "p", H3: "p", H4: "p", BLOCKQUOTE: "p",
  TR: "p", STRONG: "strong", B: "strong", EM: "em", I: "em", U: "u", UL: "ul", OL: "ol", LI: "li", A: "a",
};
const DROP = new Set(["SCRIPT", "STYLE", "HEAD", "TITLE", "META", "LINK", "TEMPLATE", "IFRAME", "OBJECT", "SVG", "MATH"]);
const BLOCKS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "BLOCKQUOTE", "UL", "OL", "LI", "TABLE", "TR"]);

/** Only web and mail links. "ecultify.com/x" gets its https://. "" when it is neither. */
export function safeHref(raw: string): string {
  const href = raw.trim();
  if (/^(https?:\/\/|mailto:)/i.test(href)) return href;
  // A link whose address is itself a field: {{portfoliolink}}.
  if (/^\{\{\s*[a-zA-Z_]+\s*\}\}$/.test(href)) return href;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(href)) return `mailto:${href}`;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#]|$)/i.test(href) ? `https://${href}` : "";
}

/**
 * Rebuild markup from the tags above, as a string. `text` decides how each run
 * of text (and its {{fields}}) comes out; a field chip from the editor comes
 * back as its {{field}} first.
 */
function clean(html: string, text: (raw: string) => string): string {
  const inside = (node: Node): string => [...node.childNodes].map(one).join("");
  const one = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return text((node.textContent ?? "").replaceAll(CARET, ""));
    if (!(node instanceof Element) || DROP.has(node.tagName.toUpperCase())) return "";
    const field = node.getAttribute("data-field");
    if (field && labelOf(field)) return text(`{{${field}}}`);
    if (node.tagName === "BR") return "<br>";
    const body = inside(node) + (/^T[DH]$/.test(node.tagName) ? " " : "");
    const tag = TAGS[node.tagName];
    // Google Docs wraps a whole paste in a <b> that is not bold.
    if (!tag || (tag === "strong" && /font-weight:\s*(normal|400)/i.test(node.getAttribute("style") ?? ""))) return body;
    if (tag === "a") {
      const href = safeHref(node.getAttribute("href") ?? "");
      return href ? `<a target="_blank" rel="noopener noreferrer nofollow" href="${escape(href)}">${body}</a>` : body;
    }
    if (tag === "p") {
      // A block holding other blocks (a pasted wrapper) is only a wrapper.
      if ([...node.children].some((c) => BLOCKS.has(c.tagName))) return body;
      return body ? `<p style="margin: 0px;">${body}</p>` : "";
    }
    return body || tag === "li" ? `<${tag}>${body}</${tag}>` : "";
  };
  const doc = new DOMParser().parseFromString(html, "text/html");
  // Text sitting outside any block becomes paragraphs of its own.
  let out = "";
  let run = "";
  const flush = (last = false) => {
    if (run.replace(/<br>/g, "").trim()) out += `<p style="margin: 0px;">${run}</p>`;
    // A lone line break between two blocks is a blank line.
    else if (run.includes("<br>") && out && !last) out += '<p style="margin: 0px;"><br></p>';
    run = "";
  };
  for (const node of doc.body.childNodes) {
    const block = node instanceof Element && (BLOCKS.has(node.tagName) || !!node.querySelector("p,div,ul,ol,li"));
    if (block) {
      flush();
      out += one(node);
    } else run += one(node);
  }
  flush(true);
  return out;
}

/** An invisible character after each chip, so the caret has somewhere to stand. Never stored. */
export const CARET = "\u200b";
export const fieldLabel = (key: string) => labelOf(key) ?? key;
const chip = (key: string) =>
  `<span data-field="${escape(key.toLowerCase())}" contenteditable="false">${escape(fieldLabel(key))}</span>${CARET}`;

const chips = (raw: string) => escape(raw).replace(FIELD, (full, key) => (labelOf(key) ? chip(key) : full));

/** Stored body -> what the editor shows: fields as chips. */
export const toEditor = (html: string) => clean(html, chips);
/** What the editor holds -> the body to store. */
export const fromEditor = (html: string) => clean(html, escape);
/** Stored body -> what a candidate receives. */
export const toPreview = (html: string, values: FieldValues) =>
  clean(fillLinks(html, values), (raw) => fillText(escape(raw), values));

/** Own keys only: "constructor" is `in` every object. */
const valueOf = (values: FieldValues, key: string) => (Object.hasOwn(values, key.toLowerCase()) ? values[key.toLowerCase()] : undefined);

/** {{fields}} inside a link's address, which the text pass does not reach. */
const fillLinks = (html: string, values: FieldValues) =>
  html.replace(/href="([^"]*)"/gi, (_full, href: string) => `href="${fillText(href, values)}"`);
const fillText = (escaped: string, values: FieldValues) =>
  escaped.replace(FIELD, (full, key: string) => {
    const value = valueOf(values, key);
    return value === undefined ? full : escape(value);
  });

/** A subject line, as chips for the editor, as plain text to store, and filled in. */
export const subjectToEditor = (subject: string) => chips(subject);
export function subjectFromEditor(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const el of doc.body.querySelectorAll("[data-field]")) el.replaceWith(`{{${el.getAttribute("data-field")}}}`);
  return (doc.body.textContent ?? "").replaceAll(CARET, "").replace(/\s+/g, " ").trim();
}
export const subjectPreview = (subject: string, values: FieldValues) =>
  subject.replace(FIELD, (full, key: string) => valueOf(values, key) ?? full);

/** The first words of a body, as plain text, for a list. Fields show as [their name]. */
export function excerpt(html: string): string {
  const doc = new DOMParser().parseFromString(clean(html, escape).replace(/<(br|\/p|\/li)[^>]*>/g, " $&"), "text/html");
  return (doc.body.textContent ?? "")
    .replace(FIELD, (full, key: string) => (labelOf(key) ? `[${labelOf(key)}]` : full))
    .replace(/\s+/g, " ")
    .trim();
}
