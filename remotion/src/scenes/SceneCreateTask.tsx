import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Calendar, User, ChevronRight, Plus, Pencil, X, Check } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { Caption } from "../components/Caption";
import { Cursor } from "../components/Cursor";
import { Badge } from "../primitives/Badge";
import { fadeIn, fadeOut, slideUp, typed, reveal } from "../lib/anim";

/**
 * Scene: a Brand Manager creates a task on a brief.
 * Visual replica of the (dashboard)/brief/[id] page → "Add Task" → modal form.
 * All state is frame-driven, no Convex involved.
 */
export function SceneCreateTask({ durationInFrames }: { durationInFrames: number }) {
  const frame = useCurrentFrame();

  // Timeline (frames, scene-local) — 600f @ 30fps = 20s
  const T = {
    sceneIn: 0,
    sidebarSettled: 14,
    cursorToAddBtn: 30,
    addBtnClicked: 80,
    modalIn: 88,
    typingTitle: 110,
    typingDesc: 220,
    cursorToAssignee: 320,
    assigneeOpen: 348,
    assigneePicked: 396,
    cursorToDeadline: 416,
    deadlinePicked: 460,
    cursorToCreate: 488,
    createClicked: 520,
    confirm: 532,
  };

  const opacity = Math.min(fadeIn(frame, 0, 14), fadeOut(frame, durationInFrames - 18, 16));

  const taskTitle = "Instagram reel — autumn capsule launch";
  const taskDesc = "Hook → b-roll of the new range → CTA. Vertical 9:16, ~20s.";

  const titleTyped = typed(taskTitle, frame, T.typingTitle, 0.7);
  const descTyped = typed(taskDesc, frame, T.typingDesc, 0.55);

  const showModal = frame >= T.modalIn;
  const modalOpacity = fadeIn(frame, T.modalIn, 14);
  const modalTx = slideUp(frame, T.modalIn, 0, 14); // 0 because we're using x slide below
  const modalSlide = (1 - reveal(frame, T.modalIn, 16)) * 60; // slide-in from right

  const showAssigneeDropdown = frame >= T.assigneeOpen && frame < T.assigneePicked + 6;
  const assigneePicked = frame >= T.assigneePicked;
  const deadlinePicked = frame >= T.deadlinePicked;
  const showConfirm = frame >= T.confirm;

  const cursorPaths = [
    { start: T.cursorToAddBtn, duration: 44, from: { x: 1500, y: 600 }, to: { x: 1620, y: 220 }, click: true },
    { start: T.cursorToAssignee, duration: 24, from: { x: 1620, y: 220 }, to: { x: 1380, y: 470 }, click: true },
    { start: T.cursorToDeadline, duration: 24, from: { x: 1380, y: 470 }, to: { x: 1380, y: 560 }, click: true },
    { start: T.cursorToCreate, duration: 28, from: { x: 1380, y: 560 }, to: { x: 1660, y: 850 }, click: true },
  ];

  return (
    <AbsoluteFill style={{ background: "var(--bg-primary)", opacity }}>
      <AppShell
        active="/briefs"
        pageTitle="Brief — Autumn capsule launch"
        user={{ name: "Riya Mehta", role: "manager" }}
      >
        {/* Brief detail page mock */}
        <div className="p-8 h-full overflow-hidden relative">
          {/* Brief header */}
          <div className="flex items-start justify-between mb-6" style={{ transform: `translateY(${slideUp(frame, 0, 18, 18)}px)`, opacity: fadeIn(frame, 0, 14) }}>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="manager">In Progress</Badge>
                <Badge variant="neutral">Multi-task brief</Badge>
                <span className="text-[12px] text-[var(--text-muted)]">Brand · Sable & Co.</span>
              </div>
              <h2 className="text-[24px] font-bold text-[var(--text-primary)]">
                Autumn capsule launch
              </h2>
              <p className="text-[13px] text-[var(--text-secondary)] mt-1 max-w-[680px]">
                Drive awareness for the autumn drop across IG and email. Two reels, three statics, one newsletter.
              </p>
            </div>
            <button
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold text-white shadow-sm"
              style={{ background: "var(--accent-admin)" }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Task
            </button>
          </div>

          {/* Existing tasks list */}
          <div className="grid grid-cols-3 gap-4" style={{ opacity: fadeIn(frame, 6, 14) }}>
            {[
              { t: "Static — hero product on cream", a: "Anya · Design", s: "In Progress", v: "manager" as const },
              { t: "Email — drop announcement", a: "Mateo · Copy", s: "In Review", v: "admin" as const },
              { t: "Static — texture macro", a: "Lia · Design", s: "To Do", v: "neutral" as const },
            ].map((t, i) => (
              <div
                key={i}
                className="bg-white rounded-xl border p-4"
                style={{
                  borderColor: "var(--border)",
                  opacity: fadeIn(frame, 6 + i * 4, 14),
                  transform: `translateY(${slideUp(frame, 6 + i * 4, 14, 14)}px)`,
                }}
              >
                <p className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug">
                  {t.t}
                </p>
                <p className="text-[11px] text-[var(--text-muted)] mt-1">{t.a}</p>
                <div className="mt-3">
                  <Badge variant={t.v}>{t.s}</Badge>
                </div>
              </div>
            ))}
          </div>

          {/* TaskDetailModal slide-over (replica) */}
          {showModal && (
            <>
              <div
                className="absolute inset-0"
                style={{ background: "rgba(0,0,0,0.4)", opacity: modalOpacity }}
              />
              <div
                className="absolute top-0 right-0 bottom-0 bg-white border-l flex flex-col"
                style={{
                  borderColor: "var(--border)",
                  width: 520,
                  transform: `translateX(${modalSlide}px)`,
                  opacity: modalOpacity,
                  boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
                }}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 p-5 border-b" style={{ borderColor: "var(--border)" }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Pencil className="h-3.5 w-3.5" style={{ color: "var(--accent-admin)" }} />
                      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--accent-admin)" }}>
                        New Task
                      </span>
                    </div>
                    <h2 className="font-bold text-[16px] text-[var(--text-primary)] leading-snug">
                      Create a task on this brief
                    </h2>
                  </div>
                  <button className="p-1.5 rounded-lg" style={{ color: "var(--text-muted)" }}>
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Form */}
                <div className="flex-1 p-5 space-y-4 overflow-hidden">
                  {/* Title */}
                  <div>
                    <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                      Title
                    </label>
                    <div
                      className="mt-1.5 w-full px-3 py-2 rounded-lg border bg-white text-[13px] min-h-[40px]"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                    >
                      {titleTyped}
                      {frame >= T.typingTitle && frame < T.typingDesc && (
                        <span className="inline-block w-[2px] h-[14px] ml-0.5 align-middle" style={{ background: "var(--accent-admin)", animation: "none" }} />
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                      Description
                    </label>
                    <div
                      className="mt-1.5 w-full px-3 py-2 rounded-lg border bg-white text-[13px] min-h-[68px] leading-relaxed whitespace-pre-wrap"
                      style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                    >
                      {descTyped}
                      {frame >= T.typingDesc && frame < T.cursorToAssignee && (
                        <span className="inline-block w-[2px] h-[14px] ml-0.5 align-middle" style={{ background: "var(--accent-admin)" }} />
                      )}
                    </div>
                  </div>

                  {/* Assignee */}
                  <div className="relative">
                    <label className="text-[11px] font-medium uppercase tracking-wide flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                      <User className="h-3 w-3" />
                      Assignee
                    </label>
                    <div
                      className="mt-1.5 w-full px-3 py-2 rounded-lg border bg-white text-[13px] flex items-center justify-between"
                      style={{
                        borderColor: showAssigneeDropdown ? "var(--accent-admin)" : "var(--border)",
                        color: assigneePicked ? "var(--text-primary)" : "var(--text-disabled)",
                      }}
                    >
                      <span>{assigneePicked ? "Anya Kapoor — Design" : "Select team member"}</span>
                      <ChevronRight className="h-3.5 w-3.5 rotate-90" style={{ color: "var(--text-muted)" }} />
                    </div>

                    {showAssigneeDropdown && (
                      <div
                        className="absolute left-0 right-0 mt-1 bg-white rounded-lg border shadow-lg z-10 overflow-hidden"
                        style={{
                          borderColor: "var(--border-strong)",
                          opacity: fadeIn(frame, T.assigneeOpen, 6),
                          transform: `translateY(${slideUp(frame, T.assigneeOpen, 8, 8)}px)`,
                        }}
                      >
                        {[
                          { name: "Anya Kapoor", team: "Design", highlighted: true },
                          { name: "Mateo Reyes", team: "Copy" },
                          { name: "Lia Park", team: "Design" },
                          { name: "Sam Idris", team: "Video" },
                        ].map((p, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 px-3 py-2 text-[13px]"
                            style={{
                              background: p.highlighted ? "var(--accent-admin-dim)" : "transparent",
                              color: "var(--text-primary)",
                            }}
                          >
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-white font-semibold text-[10px]"
                              style={{ background: "var(--accent-employee)" }}
                            >
                              {p.name.slice(0, 1)}
                            </div>
                            <span>{p.name}</span>
                            <span className="text-[11px] ml-auto" style={{ color: "var(--text-muted)" }}>
                              {p.team}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Deadline */}
                  <div>
                    <label className="text-[11px] font-medium uppercase tracking-wide flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                      <Calendar className="h-3 w-3" />
                      Deadline
                    </label>
                    <div
                      className="mt-1.5 w-full px-3 py-2 rounded-lg border bg-white text-[13px]"
                      style={{
                        borderColor: "var(--border)",
                        color: deadlinePicked ? "var(--text-primary)" : "var(--text-disabled)",
                      }}
                    >
                      {deadlinePicked ? "Fri, Oct 24 · 18:00" : "Set task deadline"}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="p-5 border-t flex items-center justify-end gap-2" style={{ borderColor: "var(--border)" }}>
                  <button
                    className="px-4 py-2 rounded-lg text-[13px] font-medium border bg-white"
                    style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                  >
                    Cancel
                  </button>
                  <button
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-semibold text-white shadow-sm"
                    style={{ background: "var(--accent-admin)" }}
                  >
                    {showConfirm ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    {showConfirm ? "Created" : "Create Task"}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Cursor */}
          <Cursor paths={cursorPaths} />
        </div>
      </AppShell>

      <Caption text="A manager opens a brief and adds a task" start={4} duration={70} />
      <Caption text="Title, description, assignee, deadline" start={T.typingTitle - 6} duration={180} />
      <Caption text="One click and it's assigned" start={T.cursorToCreate - 6} duration={70} />
    </AbsoluteFill>
  );
}
