import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Bell } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { Caption } from "../components/Caption";
import { TaskCard, type TaskStatus } from "../components/TaskCard";
import { fadeIn, fadeOut, slideUp, reveal } from "../lib/anim";

interface ColTask {
  title: string;
  brief: string;
  assignee?: string;
  deadline?: string;
}

export function SceneAssigneeDashboard({ durationInFrames }: { durationInFrames: number }) {
  const frame = useCurrentFrame();
  const opacity = Math.min(fadeIn(frame, 0, 14), fadeOut(frame, durationInFrames - 18, 16));

  // 540f = 18s
  const T = {
    sceneIn: 0,
    boardSettle: 18,
    notificationIn: 90,
    newTaskDrops: 130,
    newTaskHighlight: 160,
  };

  const columns: { title: string; status: TaskStatus; tasks: ColTask[] }[] = [
    {
      title: "To Do",
      status: "pending",
      tasks: [
        { title: "Carousel — fabric story", brief: "Autumn capsule launch", deadline: "Oct 28" },
      ],
    },
    {
      title: "In Progress",
      status: "in-progress",
      tasks: [
        { title: "Static — hero on cream", brief: "Autumn capsule launch", deadline: "Oct 22" },
      ],
    },
    {
      title: "In Review",
      status: "review",
      tasks: [
        { title: "Reel — texture macro", brief: "Autumn capsule launch", deadline: "Oct 20" },
      ],
    },
    {
      title: "Done",
      status: "done",
      tasks: [
        { title: "Mood board", brief: "Autumn capsule launch", deadline: "Oct 14" },
        { title: "Site banner — sample", brief: "Site refresh", deadline: "Oct 10" },
      ],
    },
  ];

  // Notification toast
  const showNotif = frame >= T.notificationIn && frame < T.notificationIn + 110;
  const notifOpacity = Math.min(
    fadeIn(frame, T.notificationIn, 10),
    fadeOut(frame, T.notificationIn + 96, 14)
  );

  // New task drop animation in To Do column
  const newTaskShown = frame >= T.newTaskDrops;
  const newTaskFall = (1 - reveal(frame, T.newTaskDrops, 18)) * -28;
  const newTaskOpacity = fadeIn(frame, T.newTaskDrops, 12);
  const highlightFade = fadeOut(frame, T.newTaskHighlight + 60, 30);

  return (
    <AbsoluteFill style={{ background: "var(--bg-primary)", opacity }}>
      <AppShell active="/dashboard" pageTitle="Your tasks" user={{ name: "Anya Kapoor", role: "employee" }}>
        <div className="p-8 h-full overflow-hidden">
          <div
            className="mb-6"
            style={{
              opacity: fadeIn(frame, 4, 14),
              transform: `translateY(${slideUp(frame, 4, 14, 14)}px)`,
            }}
          >
            <h2 className="text-[22px] font-bold text-[var(--text-primary)]">Hi Anya — here's your week</h2>
            <p className="text-[12px] text-[var(--text-secondary)] mt-1">5 tasks across 2 briefs · 1 due today</p>
          </div>

          <div className="grid grid-cols-4 gap-4 h-full">
            {columns.map((col, ci) => (
              <div
                key={col.title}
                className="bg-white rounded-xl border p-4"
                style={{
                  borderColor: "var(--border)",
                  opacity: fadeIn(frame, T.boardSettle + ci * 4, 14),
                  transform: `translateY(${slideUp(frame, T.boardSettle + ci * 4, 16, 14)}px)`,
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                    {col.title}
                  </p>
                  <span
                    className="px-2 py-0.5 rounded-md text-[10px] font-semibold"
                    style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
                  >
                    {col.tasks.length + (ci === 0 && newTaskShown ? 1 : 0)}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {/* New task drops into "To Do" */}
                  {ci === 0 && newTaskShown && (
                    <div
                      style={{
                        transform: `translateY(${newTaskFall}px)`,
                        opacity: newTaskOpacity,
                      }}
                    >
                      <TaskCard
                        title="Instagram reel — autumn capsule"
                        brief="Autumn capsule launch"
                        deadline="Oct 24"
                        status="pending"
                        highlighted={frame < T.newTaskHighlight + 60}
                        style={{
                          boxShadow: highlightFade > 0
                            ? `0 0 0 ${3 * highlightFade}px rgba(217, 119, 87, ${0.25 * highlightFade})`
                            : undefined,
                        }}
                      />
                    </div>
                  )}

                  {col.tasks.map((t, i) => (
                    <TaskCard
                      key={i}
                      title={t.title}
                      brief={t.brief}
                      deadline={t.deadline}
                      status={col.status}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </AppShell>

      {/* Notification toast (bottom-right) */}
      {showNotif && (
        <div
          className="absolute bottom-8 right-8 flex items-start gap-3 bg-white rounded-xl border p-4"
          style={{
            borderColor: "var(--border)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
            opacity: notifOpacity,
            width: 340,
            transform: `translateX(${(1 - reveal(frame, T.notificationIn, 14)) * 30}px)`,
          }}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "var(--accent-admin-dim)" }}
          >
            <Bell className="h-4 w-4" style={{ color: "var(--accent-admin)" }} />
          </div>
          <div className="flex-1">
            <p className="text-[12px] font-semibold text-[var(--text-primary)]">New task assigned</p>
            <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 leading-relaxed">
              Riya assigned you "Instagram reel — autumn capsule launch"
            </p>
            <p className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>just now · due Oct 24</p>
          </div>
        </div>
      )}

      <Caption text="When you're assigned a task, it lands here" start={6} duration={80} />
      <Caption text="A notification tells you what's new" start={T.notificationIn - 6} duration={70} />
      <Caption text="And the task drops into your To Do column" start={T.newTaskDrops - 6} duration={120} />
    </AbsoluteFill>
  );
}
