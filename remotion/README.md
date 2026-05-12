# Task Tracker — Induction Videos (Remotion)

Standalone Remotion workspace for producing induction / onboarding videos.
Lives next to the Next.js app but has its own deps and build pipeline.

## Setup

```bash
cd remotion
npm install
```

## Run the studio (live preview)

```bash
npm run dev
```

Opens the Remotion Studio at http://localhost:3000 (default). Pick `InductionFull` from the sidebar to preview / scrub through the video.

## Render to MP4

```bash
npm run render            # full quality → out/induction.mp4
npm run render:preview    # faster, lower quality
npm run still             # poster frame → out/poster.png
```

## Layout

- `src/Root.tsx` — composition registry
- `src/compositions/InductionFull.tsx` — the 3-minute timeline
- `src/scenes/` — individual scenes (TitleCard, SceneCreateTask, Outro, …)
- `src/components/` — `AppShell` (replica of Sidebar + TopBar), `Caption`, `Cursor`
- `src/primitives/` — copies of the app's leaf UI primitives (Button, Card, Badge)
- `src/styles.css` — Tailwind v4 + a mirror of the app's CSS variables

## Why a replica of the app shell instead of importing the real one?

The real `Sidebar` / `TaskDetailModal` are tightly coupled to Convex (`useQuery`, `useMutation`), Next.js navigation (`usePathname`, `Link`), and authenticated context. Lifting them into Remotion would require shimming an entire Convex world per scene. Instead we mirror the same Tailwind classes and CSS variables — pixel-identical to production, but every frame is deterministic and safe to render headless.

If you change a design token in `src/app/globals.css`, mirror the change in `remotion/src/styles.css` (or symlink them — see comment in that file).

## Scenes

| Range (frames) | Time     | Scene                              |
|----------------|----------|------------------------------------|
| 0–180          | 0:00–0:06 | Title card                        |
| 180–660        | 0:06–0:22 | Welcome / overview                |
| 660–1260       | 0:22–0:42 | Manager creates a task            |
| 1260–1740      | 0:42–0:58 | Manager reassigns task            |
| 1740–2280      | 0:58–1:16 | Assignee opens dashboard          |
| 2280–2880      | 1:16–1:36 | Assignee starts task              |
| 2880–3480      | 1:36–1:56 | Assignee submits deliverable      |
| 3480–4140      | 1:56–2:18 | Approval flow (lead → manager)    |
| 4140–4680      | 2:18–2:36 | Recap on analytics                |
| 4680–5400      | 2:36–3:00 | Outro                             |

Each scene lives in `src/scenes/` and can be previewed in isolation by adding a `<Composition>` for it in `src/Root.tsx`. The captions read in order are designed to make sense without audio.
