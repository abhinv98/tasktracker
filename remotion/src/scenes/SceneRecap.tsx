import { AbsoluteFill, useCurrentFrame, interpolate } from "remotion";
import { TrendingUp, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { AppShell } from "../components/AppShell";
import { Caption } from "../components/Caption";
import { fadeIn, fadeOut, slideUp, easeOut } from "../lib/anim";

/**
 * Closing recap on the analytics page — shows numbers ticking up,
 * a tiny bar chart, and team rows.
 */
export function SceneRecap({ durationInFrames }: { durationInFrames: number }) {
  const frame = useCurrentFrame();
  const opacity = Math.min(fadeIn(frame, 0, 14), fadeOut(frame, durationInFrames - 18, 16));

  const stats = [
    { icon: CheckCircle2, label: "Tasks delivered (week)", target: 23, color: "var(--accent-employee)" },
    { icon: Clock, label: "Avg time to deliver", target: 1.8, suffix: " d", color: "var(--accent-manager)", decimals: 1 },
    { icon: TrendingUp, label: "On-time rate", target: 94, suffix: "%", color: "var(--accent-admin)" },
    { icon: AlertTriangle, label: "Overdue", target: 2, color: "#F59E0B" },
  ];

  // Bar chart data — daily deliveries last 7 days
  const chart = [3, 5, 4, 6, 4, 7, 5];
  const chartMax = Math.max(...chart);

  const teamRows = [
    { name: "Anya Kapoor", role: "Design", done: 9, onTime: 100 },
    { name: "Mateo Reyes", role: "Copy", done: 6, onTime: 83 },
    { name: "Lia Park", role: "Design", done: 5, onTime: 100 },
    { name: "Sam Idris", role: "Video", done: 3, onTime: 67 },
  ];

  return (
    <AbsoluteFill style={{ background: "var(--bg-primary)", opacity }}>
      <AppShell active="/analytics" pageTitle="Analytics" user={{ name: "Riya Mehta", role: "manager" }}>
        <div className="p-8 h-full overflow-hidden">
          <div
            className="mb-6"
            style={{
              opacity: fadeIn(frame, 4, 14),
              transform: `translateY(${slideUp(frame, 4, 14, 14)}px)`,
            }}
          >
            <h2 className="text-[24px] font-bold text-[var(--text-primary)]">This week, at a glance</h2>
            <p className="text-[12px] text-[var(--text-secondary)] mt-1">Sable & Co. · 7 day window</p>
          </div>

          {/* Stat cards with tickers */}
          <div className="grid grid-cols-4 gap-4">
            {stats.map((s, i) => {
              const start = 12 + i * 6;
              const t = interpolate(frame, [start, start + 30], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: easeOut,
              });
              const value = s.target * t;
              const display = s.decimals
                ? value.toFixed(s.decimals)
                : Math.round(value).toString();
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
                  <p
                    className="text-[34px] font-bold mt-2"
                    style={{ color: "var(--text-primary)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}
                  >
                    {display}
                    {s.suffix && <span className="text-[20px] ml-0.5" style={{ color: "var(--text-secondary)" }}>{s.suffix}</span>}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Two-column: chart + team table */}
          <div className="grid grid-cols-2 gap-4 mt-6">
            {/* Bar chart */}
            <div
              className="bg-white rounded-xl border p-5"
              style={{
                borderColor: "var(--border)",
                opacity: fadeIn(frame, 56, 14),
                transform: `translateY(${slideUp(frame, 56, 16, 14)}px)`,
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>
                  Deliveries · last 7 days
                </p>
                <span className="text-[11px]" style={{ color: "var(--accent-employee)" }}>↑ 12% vs last week</span>
              </div>
              <div className="flex items-end justify-between gap-3 h-[140px]">
                {chart.map((v, i) => {
                  const start = 70 + i * 4;
                  const t = interpolate(frame, [start, start + 22], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: easeOut,
                  });
                  const h = (v / chartMax) * 120 * t;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                      <div
                        className="w-full rounded-t-md"
                        style={{
                          height: h,
                          background:
                            i === chart.length - 1 ? "var(--accent-admin)" : "var(--accent-manager)",
                          opacity: 0.85,
                        }}
                      />
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Team rows */}
            <div
              className="bg-white rounded-xl border p-5"
              style={{
                borderColor: "var(--border)",
                opacity: fadeIn(frame, 64, 14),
                transform: `translateY(${slideUp(frame, 64, 16, 14)}px)`,
              }}
            >
              <p className="text-[12px] font-bold uppercase tracking-wide mb-4" style={{ color: "var(--text-secondary)" }}>
                Team · this week
              </p>
              <div className="space-y-3">
                {teamRows.map((t, i) => {
                  const start = 76 + i * 5;
                  return (
                    <div
                      key={t.name}
                      className="flex items-center gap-3"
                      style={{
                        opacity: fadeIn(frame, start, 12),
                        transform: `translateX(${(1 - Math.min(1, Math.max(0, (frame - start) / 14))) * 12}px)`,
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-[12px] shrink-0"
                        style={{ background: "var(--accent-employee)" }}
                      >
                        {t.name.slice(0, 1)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[var(--text-primary)]">{t.name}</p>
                        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t.role}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>delivered</p>
                          <p className="text-[14px] font-bold text-[var(--text-primary)]" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {t.done}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>on time</p>
                          <p
                            className="text-[14px] font-bold"
                            style={{
                              fontVariantNumeric: "tabular-nums",
                              color: t.onTime >= 90 ? "var(--accent-employee)" : t.onTime >= 75 ? "#F59E0B" : "var(--danger)",
                            }}
                          >
                            {t.onTime}%
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </AppShell>

      <Caption text="And everyone sees the picture — live" start={6} duration={120} />
      <Caption text="Throughput, on-time rate, who's shipping what" start={130} duration={160} />
      <Caption text="No status meetings — the platform is the status" start={300} duration={140} />
    </AbsoluteFill>
  );
}
