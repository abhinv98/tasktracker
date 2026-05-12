import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Briefcase, ListTodo, Send, CheckCircle2, ArrowRight } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { Caption } from "../components/Caption";
import { fadeIn, fadeOut, slideUp } from "../lib/anim";

export function SceneWelcome({ durationInFrames }: { durationInFrames: number }) {
  const frame = useCurrentFrame();
  const opacity = Math.min(fadeIn(frame, 0, 14), fadeOut(frame, durationInFrames - 18, 16));

  const stats = [
    { icon: Briefcase, label: "Active Briefs", value: "12", color: "var(--accent-manager)" },
    { icon: ListTodo, label: "Open Tasks", value: "47", color: "var(--accent-admin)" },
    { icon: Send, label: "In Review", value: "9", color: "#F59E0B" },
    { icon: CheckCircle2, label: "Delivered (week)", value: "23", color: "var(--accent-employee)" },
  ];

  const flow = [
    { label: "Brief", desc: "Project from brand", color: "var(--accent-manager)" },
    { label: "Task", desc: "Assigned to a person", color: "var(--accent-admin)" },
    { label: "Deliverable", desc: "Submitted for review", color: "#F59E0B" },
    { label: "Done", desc: "Approved & shipped", color: "var(--accent-employee)" },
  ];

  return (
    <AbsoluteFill style={{ background: "var(--bg-primary)", opacity }}>
      <AppShell active="/dashboard" pageTitle="Dashboard" user={{ name: "Riya Mehta", role: "manager" }}>
        <div className="p-8 h-full">
          <div
            style={{
              opacity: fadeIn(frame, 4, 14),
              transform: `translateY(${slideUp(frame, 4, 16, 16)}px)`,
            }}
          >
            <h2 className="text-[28px] font-bold text-[var(--text-primary)]">Good morning, Riya</h2>
            <p className="text-[14px] text-[var(--text-secondary)] mt-1">Here's everything moving today.</p>
          </div>

          <div className="grid grid-cols-4 gap-4 mt-7">
            {stats.map((s, i) => {
              const start = 14 + i * 6;
              return (
                <div
                  key={s.label}
                  className="bg-white rounded-xl border p-4"
                  style={{
                    borderColor: "var(--border)",
                    opacity: fadeIn(frame, start, 14),
                    transform: `translateY(${slideUp(frame, start, 16, 14)}px)`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-wide font-semibold" style={{ color: "var(--text-muted)" }}>
                      {s.label}
                    </p>
                    <s.icon className="h-4 w-4" style={{ color: s.color }} />
                  </div>
                  <p className="text-[36px] font-bold mt-2" style={{ color: "var(--text-primary)", lineHeight: 1 }}>
                    {s.value}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Flow visualisation */}
          <div
            className="mt-10"
            style={{
              opacity: fadeIn(frame, 60, 16),
              transform: `translateY(${slideUp(frame, 60, 18, 16)}px)`,
            }}
          >
            <p className="text-[12px] uppercase tracking-[0.18em] font-semibold mb-4" style={{ color: "var(--text-muted)" }}>
              How work moves
            </p>
            <div className="flex items-stretch gap-3">
              {flow.map((step, i) => {
                const start = 78 + i * 12;
                return (
                  <div key={step.label} className="flex items-stretch gap-3 flex-1">
                    <div
                      className="flex-1 bg-white rounded-xl border p-5"
                      style={{
                        borderColor: "var(--border)",
                        borderLeft: `3px solid ${step.color}`,
                        opacity: fadeIn(frame, start, 14),
                        transform: `translateY(${slideUp(frame, start, 14, 14)}px)`,
                      }}
                    >
                      <p className="text-[11px] uppercase tracking-wide font-semibold mb-1" style={{ color: step.color }}>
                        Step {i + 1}
                      </p>
                      <p className="text-[18px] font-bold text-[var(--text-primary)]">{step.label}</p>
                      <p className="text-[12px] text-[var(--text-secondary)] mt-1">{step.desc}</p>
                    </div>
                    {i < flow.length - 1 && (
                      <div
                        className="flex items-center"
                        style={{ opacity: fadeIn(frame, start + 6, 14) }}
                      >
                        <ArrowRight className="h-5 w-5" style={{ color: "var(--text-muted)" }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </AppShell>

      <Caption text="This is your home — briefs, tasks, deliverables" start={4} duration={70} position="bottom" />
      <Caption text="Every brief becomes one or more tasks" start={80} duration={90} position="bottom" />
      <Caption text="Tasks become deliverables — and then Done" start={170} duration={120} position="bottom" />
    </AbsoluteFill>
  );
}
