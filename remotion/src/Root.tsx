import { Composition } from "remotion";
import { InductionFull, TOTAL_FRAMES } from "./compositions/InductionFull";
import "./styles.css";

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="InductionFull"
        component={InductionFull}
        durationInFrames={TOTAL_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
}
