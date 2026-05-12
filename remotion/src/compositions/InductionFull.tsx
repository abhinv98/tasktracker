import { AbsoluteFill, Sequence } from "remotion";
import { TitleCard } from "../scenes/TitleCard";
import { SceneWelcome } from "../scenes/SceneWelcome";
import { SceneCreateTask } from "../scenes/SceneCreateTask";
import { SceneAssign } from "../scenes/SceneAssign";
import { SceneAssigneeDashboard } from "../scenes/SceneAssigneeDashboard";
import { SceneStartTask } from "../scenes/SceneStartTask";
import { SceneSubmit } from "../scenes/SceneSubmit";
import { SceneApproval } from "../scenes/SceneApproval";
import { SceneRecap } from "../scenes/SceneRecap";
import { Outro } from "../scenes/Outro";

/**
 * Full induction video — 3 minutes @ 30fps (5400 frames).
 *
 *  0– 180 ( 6s)  Title card
 *  180– 660 (16s) Welcome / overview
 *  660–1260 (20s) Manager creates a task
 * 1260–1740 (16s) Manager reassigns task
 * 1740–2280 (18s) Assignee opens dashboard, sees the new task
 * 2280–2880 (20s) Assignee starts the task
 * 2880–3480 (20s) Assignee submits a deliverable
 * 3480–4140 (22s) Approval flow (lead → manager → Done)
 * 4140–4680 (18s) Recap on analytics
 * 4680–5400 (24s) Outro
 */
export const TOTAL_FRAMES = 5400;

export function InductionFull() {
  return (
    <AbsoluteFill style={{ background: "var(--bg-primary)" }}>
      <Sequence from={0} durationInFrames={180}>
        <TitleCard durationInFrames={180} />
      </Sequence>

      <Sequence from={180} durationInFrames={480}>
        <SceneWelcome durationInFrames={480} />
      </Sequence>

      <Sequence from={660} durationInFrames={600}>
        <SceneCreateTask durationInFrames={600} />
      </Sequence>

      <Sequence from={1260} durationInFrames={480}>
        <SceneAssign durationInFrames={480} />
      </Sequence>

      <Sequence from={1740} durationInFrames={540}>
        <SceneAssigneeDashboard durationInFrames={540} />
      </Sequence>

      <Sequence from={2280} durationInFrames={600}>
        <SceneStartTask durationInFrames={600} />
      </Sequence>

      <Sequence from={2880} durationInFrames={600}>
        <SceneSubmit durationInFrames={600} />
      </Sequence>

      <Sequence from={3480} durationInFrames={660}>
        <SceneApproval durationInFrames={660} />
      </Sequence>

      <Sequence from={4140} durationInFrames={540}>
        <SceneRecap durationInFrames={540} />
      </Sequence>

      <Sequence from={4680} durationInFrames={720}>
        <Outro durationInFrames={720} />
      </Sequence>
    </AbsoluteFill>
  );
}
