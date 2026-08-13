"use client";

import { useEffect, useState, useCallback, createContext, useContext } from "react";

/**
 * The earned-moment celebration. Deliberately scarce: exactly three things in
 * this app are hard-won — a deliverable clearing FINAL approval, a brief
 * reaching Completed, and a queue actually hitting zero. Those get this.
 * Nothing else does, because a celebration that fires on every save stops
 * being a celebration by Wednesday.
 *
 * No confetti library, no dependency: a drawn check and one specific line.
 * Auto-dismisses in 2s and never blocks — you can keep working straight
 * through it.
 */

type Celebration = { id: number; title: string; detail?: string };

const CelebrateContext = createContext<{
  celebrate: (title: string, detail?: string) => void;
}>({ celebrate: () => {} });

export function useCelebrate() {
  return useContext(CelebrateContext);
}

let nextId = 0;

export function CelebrateProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Celebration[]>([]);

  const celebrate = useCallback((title: string, detail?: string) => {
    const id = nextId++;
    setItems((prev) => [...prev, { id, title, detail }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return (
    <CelebrateContext.Provider value={{ celebrate }}>
      {children}
      {/* Announced politely — the moment is meaningful to screen reader users
          too, and the visual is aria-hidden. */}
      <div className="sr-only" role="status" aria-live="polite">
        {items.map((c) => (
          <p key={c.id}>
            {c.title}. {c.detail}
          </p>
        ))}
      </div>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-20 z-[70] flex flex-col items-center gap-2"
      >
        {items.map((c) => (
          <CelebrationCard key={c.id} item={c} onDone={() => dismiss(c.id)} />
        ))}
      </div>
    </CelebrateContext.Provider>
  );
}

function CelebrationCard({
  item,
  onDone,
}: {
  item: Celebration;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="animate-celebrate flex items-center gap-3 rounded-xl border border-[var(--accent-employee)]/30 bg-white px-4 py-3 shadow-lg">
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6 shrink-0"
        fill="none"
        stroke="var(--accent-employee-text)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path className="animate-draw-check" d="M20 6 9 17l-5-5" />
      </svg>
      <div>
        <p className="font-semibold text-[13px] text-[var(--text-primary)]">
          {item.title}
        </p>
        {item.detail && (
          <p className="text-[12px] text-[var(--text-secondary)]">
            {item.detail}
          </p>
        )}
      </div>
    </div>
  );
}
