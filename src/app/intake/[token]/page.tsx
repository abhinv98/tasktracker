"use client";

import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import {
  Inbox,
  Plus,
  X,
  Send,
  Loader2,
  CheckCircle2,
  Clock,
  Calendar,
  Paperclip,
  Link2,
  Image as ImageIcon,
  FileText,
  Video,
  Trash2,
} from "lucide-react";

type RefKind = "image" | "document" | "video" | "link";
type PendingRef = {
  kind: RefKind;
  name?: string;
  url?: string;
  fileKey?: string;
  contentType?: string;
  // client-only preview state
  _localName?: string;
  _uploading?: boolean;
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending_review: { label: "Awaiting Review", color: "#b45309", bg: "#fffbeb" },
  accepted: { label: "Accepted", color: "#047857", bg: "#ecfdf5" },
  in_progress: { label: "In Progress", color: "#1d4ed8", bg: "#eff6ff" },
  completed: { label: "Completed", color: "#047857", bg: "#ecfdf5" },
  declined: { label: "Declined", color: "#b91c1c", bg: "#fef2f2" },
};

function kindFromFile(file: File): RefKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "document";
}

function RefIcon({ kind, color }: { kind: RefKind; color: string }) {
  const cls = "h-3.5 w-3.5 shrink-0";
  if (kind === "image") return <ImageIcon className={cls} style={{ color }} />;
  if (kind === "video") return <Video className={cls} style={{ color }} />;
  if (kind === "link") return <Link2 className={cls} style={{ color }} />;
  return <FileText className={cls} style={{ color }} />;
}

export default function IntakePublicPage() {
  const params = useParams();
  const token = params.token as string;
  const intake = useQuery(api.jsr.getIntakeByToken, { token });
  const addClientTask = useMutation(api.jsr.addClientTask);

  const [clientName, setClientName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [refs, setRefs] = useState<PendingRef[]>([]);
  const [linkInput, setLinkInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    for (const file of arr) {
      const kind = kindFromFile(file);
      const placeholder: PendingRef = {
        kind,
        name: file.name,
        contentType: file.type,
        _localName: file.name,
        _uploading: true,
      };
      setRefs((prev) => [...prev, placeholder]);
      try {
        const presignRes = await fetch("/api/r2-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, contentType: file.type || "application/octet-stream" }),
        });
        const { uploadUrl, fileKey } = await presignRes.json();
        await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        setRefs((prev) =>
          prev.map((r) =>
            r._localName === file.name && r._uploading
              ? { ...r, fileKey, _uploading: false }
              : r
          )
        );
      } catch {
        setRefs((prev) => prev.filter((r) => !(r._localName === file.name && r._uploading)));
        setError("A file failed to upload. Please try again.");
      }
    }
  }

  function addLink() {
    const raw = linkInput.trim();
    if (!raw) return;
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const isVideo = /(youtube\.com|youtu\.be|vimeo\.com|\.mp4|\.mov)/i.test(url);
    setRefs((prev) => [...prev, { kind: isVideo ? "video" : "link", url, name: raw }]);
    setLinkInput("");
  }

  function removeRef(idx: number) {
    setRefs((prev) => prev.filter((_, i) => i !== idx));
  }

  const uploading = refs.some((r) => r._uploading);

  async function submit() {
    if (!title.trim() || submitting || uploading) return;
    setSubmitting(true);
    setError(null);
    try {
      const references = refs
        .filter((r) => !r._uploading)
        .map((r) => ({
          kind: r.kind,
          name: r.name,
          url: r.url,
          fileKey: r.fileKey,
          contentType: r.contentType,
        }));
      await addClientTask({
        token,
        title: title.trim(),
        description: description.trim() || undefined,
        proposedDeadline: deadline ? new Date(deadline + "T00:00:00").getTime() : undefined,
        clientName: clientName.trim() || undefined,
        references: references.length > 0 ? references : undefined,
      });
      setTitle("");
      setDescription("");
      setDeadline("");
      setRefs([]);
      setLinkInput("");
      setJustSubmitted(true);
      setTimeout(() => setJustSubmitted(false), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit request.");
    }
    setSubmitting(false);
  }

  if (intake === undefined) {
    return (
      <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-[3px] border-[#e5e5e5] border-t-[#171717] rounded-full animate-spin" />
          <p className="text-[13px] text-[#a3a3a3] font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (intake === null) {
    return (
      <div className="min-h-screen bg-[#f8f8f8] flex items-center justify-center">
        <div className="text-center max-w-sm mx-auto p-8">
          <div className="w-16 h-16 rounded-2xl bg-[#fef2f2] flex items-center justify-center mx-auto mb-4">
            <Inbox className="h-8 w-8 text-[#ef4444]" />
          </div>
          <h1 className="text-[20px] font-semibold text-[#171717] mb-2">Link Expired</h1>
          <p className="text-[14px] text-[#737373] leading-relaxed">
            This intake link is no longer active. Please contact your account manager for an updated link.
          </p>
        </div>
      </div>
    );
  }

  const bc = intake.brand.color;
  const tasks = intake.tasks ?? [];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f8f8f8" }}>
      {/* ═══ BRANDED HEADER ═══ */}
      <header className="sticky top-0 z-20">
        <div style={{ background: `linear-gradient(135deg, ${bc}, ${bc}dd)` }}>
          <div className="max-w-5xl mx-auto px-6 py-6">
            <div className="flex items-center gap-4">
              {intake.brand.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={intake.brand.logoUrl}
                  alt={intake.brand.name}
                  className="w-12 h-12 rounded-2xl object-cover border-2 border-white/20"
                />
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <span className="font-bold text-[20px] text-white">{intake.brand.name[0]}</span>
                </div>
              )}
              <div className="flex-1">
                <h1 className="font-bold text-[20px] text-white tracking-tight">{intake.brand.name}</h1>
                <p className="text-[13px] text-white/70 font-medium">Request a Task</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* ═══ REQUEST FORM ═══ */}
        <section className="bg-white rounded-2xl border border-[#e5e5e5] overflow-hidden shadow-sm">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-[#f0f0f0]">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: bc + "12" }}>
              <Plus className="h-3.5 w-3.5" style={{ color: bc }} />
            </div>
            <h2 className="font-semibold text-[15px] text-[#171717]">New Request</h2>
          </div>
          <div className="p-6 space-y-4">
            {justSubmitted && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <p className="text-[13px] text-emerald-700 font-medium">
                  Request submitted. The team will review it and confirm a timeline.
                </p>
              </div>
            )}
            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-100">
                <p className="text-[13px] text-red-600 font-medium">{error}</p>
              </div>
            )}

            <Field label="Your name">
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Who's requesting this?"
                className="intake-input"
                style={{ "--tw-ring-color": bc + "30" } as React.CSSProperties}
              />
            </Field>

            <Field label="Task title" required>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Instagram carousel for product launch"
                className="intake-input"
                style={{ "--tw-ring-color": bc + "30" } as React.CSSProperties}
              />
            </Field>

            <Field label="Details">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what you need, tone, key messages, dimensions, anything relevant..."
                rows={4}
                className="intake-input resize-none"
                style={{ "--tw-ring-color": bc + "30" } as React.CSSProperties}
              />
            </Field>

            <Field label="Proposed deadline">
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="intake-input"
                style={{ "--tw-ring-color": bc + "30" } as React.CSSProperties}
              />
            </Field>

            {/* References */}
            <div>
              <label className="block text-[12px] font-semibold text-[#525252] mb-1.5">
                References <span className="font-normal text-[#a3a3a3]">(images, documents, videos, links)</span>
              </label>

              {refs.length > 0 && (
                <div className="flex flex-col gap-1.5 mb-2">
                  {refs.map((r, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#fafafa] border border-[#e5e5e5]"
                    >
                      {r._uploading ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#a3a3a3]" />
                      ) : (
                        <RefIcon kind={r.kind} color={bc} />
                      )}
                      <span className="flex-1 text-[12px] text-[#525252] truncate">
                        {r.name || r.url}
                        {r._uploading && <span className="text-[#a3a3a3]"> — uploading…</span>}
                      </span>
                      <button
                        onClick={() => removeRef(idx)}
                        className="p-1 rounded hover:bg-[#f0f0f0] text-[#a3a3a3]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#e5e5e5] text-[12px] font-medium text-[#525252] hover:border-[#c4c4c4] cursor-pointer transition-colors">
                  <Paperclip className="h-3.5 w-3.5" />
                  Attach files
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      handleFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>

              <div className="flex items-center gap-2 mt-2">
                <input
                  value={linkInput}
                  onChange={(e) => setLinkInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addLink();
                    }
                  }}
                  placeholder="Paste a link (Drive, YouTube, Figma…)"
                  className="intake-input flex-1"
                  style={{ "--tw-ring-color": bc + "30" } as React.CSSProperties}
                />
                <button
                  onClick={addLink}
                  disabled={!linkInput.trim()}
                  className="shrink-0 px-3 py-2 rounded-lg border border-[#e5e5e5] text-[12px] font-medium text-[#525252] hover:border-[#c4c4c4] disabled:opacity-40 transition-colors"
                >
                  Add
                </button>
              </div>
            </div>

            <button
              onClick={submit}
              disabled={!title.trim() || submitting || uploading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-[14px] font-semibold transition-all disabled:opacity-50"
              style={{ backgroundColor: bc }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {uploading ? "Uploading references…" : submitting ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        </section>

        {/* ═══ YOUR REQUESTS (right column) ═══ */}
        <section className="bg-white rounded-2xl border border-[#e5e5e5] overflow-hidden shadow-sm lg:sticky lg:top-[104px]">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-[#f0f0f0]">
            <div className="w-7 h-7 rounded-lg bg-[#f0f0f0] flex items-center justify-center">
              <Clock className="h-3.5 w-3.5 text-[#525252]" />
            </div>
            <h2 className="font-semibold text-[15px] text-[#171717]">Your Requests</h2>
            <span className="text-[12px] text-[#a3a3a3] ml-1">{tasks.length}</span>
          </div>
          {tasks.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#f5f5f5] flex items-center justify-center mx-auto mb-3">
                <Inbox className="h-6 w-6 text-[#c4c4c4]" />
              </div>
              <p className="text-[13px] text-[#737373]">No requests yet.</p>
              <p className="text-[12px] text-[#a3a3a3] mt-0.5">
                Submitted tasks and their status will appear here.
              </p>
            </div>
          ) : (
            <div>
              {tasks.map((t, i) => {
                const meta = STATUS_META[t.status] ?? STATUS_META.pending_review;
                return (
                  <div
                    key={t._id}
                    className={`px-6 py-4 ${i < tasks.length - 1 ? "border-b border-[#f5f5f5]" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-[14px] text-[#171717]">{t.title}</p>
                        {t.description && (
                          <p className="text-[12px] text-[#737373] mt-0.5 line-clamp-2">{t.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-[#a3a3a3]">
                          {t.proposedDeadline && (
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> Requested {formatDate(t.proposedDeadline)}
                            </span>
                          )}
                          {t.referenceCount > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Paperclip className="h-3 w-3" /> {t.referenceCount} reference{t.referenceCount > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        className="shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full"
                        style={{ color: meta.color, backgroundColor: meta.bg }}
                      >
                        {meta.label}
                      </span>
                    </div>
                    {t.status !== "pending_review" && t.finalDeadline && (
                      <div
                        className="mt-2.5 flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-lg"
                        style={{ color: bc, backgroundColor: bc + "0d" }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Confirmed completion date: {formatDate(t.finalDeadline)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
        </div>

        <footer className="text-center pt-2 pb-8">
          <p className="text-[11px] text-[#d4d4d4]">Powered by Ecultify</p>
        </footer>
      </main>

      <style jsx global>{`
        .intake-input {
          width: 100%;
          padding: 0.6rem 0.75rem;
          border-radius: 0.75rem;
          border: 1px solid #e5e5e5;
          font-size: 13px;
          color: #171717;
          background: white;
          outline: none;
        }
        .intake-input::placeholder {
          color: #c4c4c4;
        }
        .intake-input:focus {
          box-shadow: 0 0 0 2px var(--tw-ring-color);
          border-color: transparent;
        }
      `}</style>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-[#525252] mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
