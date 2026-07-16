import { describe, expect, it } from "vitest";
import { OPEN_STAGE_IDS } from "./contracts";
import { getStageDefinition } from "./stages";
import { nativeStageHorizontalFrustum } from "./threeStageRenderer";

describe("optional native stage camera", () => {
  it("keeps a 2D-only pack on the normal projection without requiring a scene", () => {
    const openStage = OPEN_STAGE_IDS[0];
    expect(getStageDefinition(openStage).scene).toBeUndefined();
    expect(nativeStageHorizontalFrustum(openStage, 1_280)).toEqual({
      left: -640,
      right: 640,
    });
  });
});
