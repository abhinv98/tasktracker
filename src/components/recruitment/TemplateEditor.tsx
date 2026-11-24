"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Link2, List, ListOrdered, Underline } from "lucide-react";
import { fieldClass } from "@/components/ui/classes";
import {
  CARET, TEMPLATE_FIELDS, fieldLabel, fromEditor, safeHref, subjectFromEditor, subjectPreview, subjectToEditor,
  toEditor, toPreview, type FieldValues,
} from "@/lib/templateHtml";

// How a template reads on screen: the paragraphs and lists of an email, and the
// fields as chips. Tailwind strips list styles, so they are put back here.
const PROSE =
  "text-[14px] leading-[1.55] text-[var(--text-primary)] [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:text-[var(--accent-manager-text)] [&_a]:underline [&_[data-field]]:mx-px [&_[data-field]]:whitespace-nowrap [&_[data-field]]:rounded [&_[data-field]]:bg-[var(--accent-admin-dim)] [&_[data-field]]:px-1.5 [&_[data-field]]:py-px [&_[data-field]]:text-[0.92em] [&_[data-field]]:font-medium [&_[data-field]]:text-[var(--accent-admin-text)]";
const BOX =
  "w-full rounded-control border border-[var(--border)] bg-white px-3 focus:outline-none focus:ring-2 focus:ring-[var(--accent-admin)]";

// ponytail: execCommand is deprecated but every browser still has it, and it
// keeps undo working. Swap in an editor library if templates ever need images
// or tables.
const run = (command: string, value?: string) => document.execCommand(command, false, value);

const TOOLS = [
  ["bold", "Bold", Bold],
  ["italic", "Italic", Italic],
  ["underline", "Underline", Underline],
  ["insertUnorderedList", "Bulleted list", List],
  ["insertOrderedList", "Numbered list", ListOrdered],
] as const;

/** The "insert a field" dropdown. It puts the field where the caret was. */
function FieldPicker({ onPick }: { onPick: (key: string) => void }) {
  return (
    <select
      value=""
      onChange={(e) => e.target.value && onPick(e.target.value)}
      aria-label="Insert candidate detail"
      className={`${fieldClass} cursor-pointer bg-white text-[12px] font-medium`}
    >
      <option value="">Insert candidate detail…</option>
      {TEMPLATE_FIELDS.map((f) => (
        <option key={f.key} value={f.key}>
          {f.label}
        </option>
      ))}
    </select>
  );
}

/** Remembers where the caret was in a box, so a dropdown or link field can write back to it. */
function useCaret() {
  const box = useRef<HTMLDivElement>(null);
  const saved = useRef<Range | null>(null);
  const keep = () => {
    const sel = window.getSelection();
    if (sel?.rangeCount && box.current?.contains(sel.anchorNode)) saved.current = sel.getRangeAt(0).cloneRange();
  };
  const restore = () => {
    const el = box.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    let range = saved.current;
    if (!range || !el.contains(range.startContainer)) {
      range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
    }
    sel?.removeAllRanges();
    sel?.addRange(range);
  };
  /** Put a field where the caret was. Done by hand: the browser's own insert
   *  drops an uneditable chip outside the paragraph and swallows what is typed next. */
  const insertField = (key: string) => {
    restore();
    const sel = window.getSelection();
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
    if (!sel || !range) return;
    const at = range.startContainer;
    const inside = (at instanceof Element ? at : at.parentElement)?.closest("[data-field]");
    if (inside) range.setStartAfter(inside);
    range.deleteContents();
    const chip = document.createElement("span");
    chip.dataset.field = key;
    chip.contentEditable = "false";
    chip.textContent = fieldLabel(key);
    const spot = document.createTextNode(CARET);
    range.insertNode(spot);
    range.insertNode(chip);
    // Inserting splits the text around it and can leave empty pieces behind.
    spot.parentNode?.normalize();
    range.setStart(spot, 1);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };
  /** Backspace right after a chip: take the invisible character too, so one press removes the chip. */
  const onBackspace = (e: React.KeyboardEvent) => {
    const sel = window.getSelection();
    if (e.key !== "Backspace" || !sel?.isCollapsed || !sel.anchorNode) return;
    const { anchorNode: node, anchorOffset: i } = sel;
    const before = node instanceof Text ? node : node.childNodes[i - 1];
    const at = node instanceof Text ? i : (before?.textContent?.length ?? 0);
    if (before instanceof Text && before.data[at - 1] === CARET) before.deleteData(at - 1, 1);
  };
  return { box, keep, restore, insertField, onBackspace };
}

/** Subject line: one line of text with fields in it. */
export function SubjectEditor({ value, onChange }: { value: string; onChange: (subject: string) => void }) {
  const { box, keep, insertField, onBackspace } = useCaret();
  // Filled once: after that the browser owns the content, or the caret would jump.
  useEffect(() => {
    if (box.current) box.current.innerHTML = subjectToEditor(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const read = () => {
    keep();
    if (box.current) onChange(subjectFromEditor(box.current.innerHTML));
  };
  return (
    <div>
      <div className="mb-1.5 flex items-end justify-between gap-2">
        <span className="text-[12px] font-medium text-[var(--text-secondary)]">Subject</span>
        <FieldPicker
          onPick={(key) => {
            insertField(key);
            read();
          }}
        />
      </div>
      <div
        ref={box}
        role="textbox"
        aria-label="Subject"
        contentEditable
        suppressContentEditableWarning
        onInput={read}
        onKeyUp={keep}
        onMouseUp={keep}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
          onBackspace(e);
        }}
        onPaste={(e) => {
          e.preventDefault();
          run("insertText", e.clipboardData.getData("text/plain").replace(/\s+/g, " "));
        }}
        onDrop={(e) => e.preventDefault()}
        className={`${BOX} ${PROSE} min-h-[36px] py-1.5`}
      />
    </div>
  );
}

/** Message: written as it will look, with a small toolbar. */
export function BodyEditor({ value, onChange }: { value: string; onChange: (body: string) => void }) {
  const { box, keep, restore, insertField, onBackspace } = useCaret();
  const [link, setLink] = useState<string | null>(null);
  const [on, setOn] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (box.current) box.current.innerHTML = toEditor(value);
    run("defaultParagraphSeparator", "p");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const read = () => {
    caret();
    if (box.current) onChange(fromEditor(box.current.innerHTML));
  };
  /** Keep the caret, and light up the buttons that apply where it is. */
  const caret = () => {
    keep();
    setOn(Object.fromEntries(TOOLS.map(([command]) => [command, document.queryCommandState(command)])));
  };
  const addLink = () => {
    const href = safeHref(link ?? "");
    if (!href) return;
    restore();
    if (window.getSelection()?.isCollapsed) {
      const a = document.createElement("a");
      a.href = href;
      a.textContent = href.replace(/^mailto:/, "");
      run("insertHTML", a.outerHTML);
    } else run("createLink", href);
    setLink(null);
    read();
  };
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-1">
        <span className="mr-auto text-[12px] font-medium text-[var(--text-secondary)]">Message</span>
        {TOOLS.map(([command, label, Icon]) => (
          <button
            key={command}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={!!on[command]}
            // Not click: the box must keep its selection.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              restore();
              run(command);
              read();
            }}
            className={`inline-flex h-control w-control items-center justify-center rounded-control transition-colors ${
              on[command]
                ? "bg-[var(--bg-hover)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Icon size={15} />
          </button>
        ))}
        <button
          type="button"
          aria-label="Link"
          title="Link"
          aria-pressed={link !== null}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setLink(link === null ? "" : null)}
          className="mr-1 inline-flex h-control w-control items-center justify-center rounded-control text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <Link2 size={15} />
        </button>
        <FieldPicker
          onPick={(key) => {
            insertField(key);
            read();
          }}
        />
      </div>
      {link !== null && (
        <div className="mb-1.5 flex gap-2">
          <input
            autoFocus
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              addLink();
            }}
            placeholder="Paste a web address, then Enter"
            aria-label="Link address"
            className={`${fieldClass} flex-1`}
          />
          <button
            type="button"
            disabled={!safeHref(link)}
            onClick={addLink}
            className="h-control rounded-control border border-[var(--border)] px-3 text-[13px] font-medium hover:bg-[var(--bg-hover)] disabled:opacity-50"
          >
            Add link
          </button>
        </div>
      )}
      <div
        ref={box}
        role="textbox"
        aria-multiline="true"
        aria-label="Message"
        contentEditable
        suppressContentEditableWarning
        onInput={read}
        onKeyDown={onBackspace}
        onKeyUp={caret}
        onMouseUp={caret}
        onPaste={(e) => {
          e.preventDefault();
          const html = e.clipboardData.getData("text/html");
          if (html) run("insertHTML", toEditor(html));
          else run("insertText", e.clipboardData.getData("text/plain"));
        }}
        onDrop={(e) => e.preventDefault()}
        className={`${BOX} ${PROSE} max-h-[46vh] min-h-[240px] overflow-y-auto py-2.5`}
      />
    </div>
  );
}

/** The email as the candidate gets it. */
export function EmailPreview({
  subject,
  body,
  values,
  to,
}: {
  subject: string;
  body: string;
  values: FieldValues;
  to: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
      <dl className="space-y-0.5 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 py-2.5 text-[12px] text-[var(--text-muted)]">
        <div>
          From <span className="text-[var(--text-primary)]">HR Team, hr@ecultify.com</span>
        </div>
        <div>
          To <span className="text-[var(--text-primary)]">{to}</span>
        </div>
        <div>
          Subject <span className="font-medium text-[var(--text-primary)]">{subjectPreview(subject, values) || "(no subject)"}</span>
        </div>
      </dl>
      {/* Rebuilt from a short list of tags by toPreview, never the stored markup itself. */}
      <div
        className={`${PROSE} max-h-[42vh] overflow-y-auto px-4 py-3`}
        dangerouslySetInnerHTML={{ __html: toPreview(body, values) || "<p>(empty message)</p>" }}
      />
    </div>
  );
}
