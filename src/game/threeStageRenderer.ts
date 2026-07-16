import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { StageId } from "./contracts";
import { getStageDefinition } from "./stages";

interface StageCameraState {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

interface ScreenShake {
  readonly x: number;
  readonly y: number;
}

export const nativeStageHorizontalFrustum = (
  stage: StageId,
  visibleWidth: number,
): Readonly<{ left: number; right: number }> => {
  const direction = getStageDefinition(stage).scene?.cameraDirection ?? 1;
  return {
    left: direction * -visibleWidth / 2,
    right: direction * visibleWidth / 2,
  };
};

const disposeMaterial = (material: Material): void => {
  for (const value of Object.values(material)) {
    if (
      value &&
      typeof value === "object" &&
      "isTexture" in value &&
      (value as Texture).isTexture
    ) (value as Texture).dispose();
  }
  material.dispose();
};

const disposeModel = (root: Object3D): void => {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    materials.forEach(disposeMaterial);
  });
};

/**
 * Renders an optional open stage mesh on a dedicated WebGL canvas.
 * Fighters, hit effects, items and HUD stay in the deterministic 2D renderer.
 */
export class ThreeStageRenderer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-800, 800, 450, -450, 1, 4_000_000);
  private readonly draco = new DRACOLoader();
  private readonly loader = new GLTFLoader();
  private model: Group | null = null;
  private readonly modelBounds = new Box3();
  private activeStage: StageId | null = null;
  private readyStage: StageId | null = null;
  private modelLoad: Promise<void> | null = null;
  private loadGeneration = 0;
  private width = 0;
  private height = 0;
  private pixelRatio = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(new Color(0x000000), 0);
    this.draco.setDecoderPath("/assets/vendor/draco/");
    this.draco.setWorkerLimit(2);
    this.loader.setDRACOLoader(this.draco);

    this.scene.add(new AmbientLight(0xffffff, 0.78));
    const key = new DirectionalLight(0xfff1dd, 1.45);
    key.position.set(-700, 1_100, 1_300);
    this.scene.add(key);
    const fill = new DirectionalLight(0xbad7ff, 0.52);
    fill.position.set(900, 280, 600);
    this.scene.add(fill);
  }

  prepare(stage: StageId): void {
    const definition = getStageDefinition(stage);
    const stageScene = definition.scene;
    if (!stageScene) {
      if (this.activeStage === stage && !this.model && !this.modelLoad) return;
      this.activeStage = stage;
      this.readyStage = null;
      this.loadGeneration += 1;
      this.modelLoad = null;
      if (this.model) {
        this.scene.remove(this.model);
        disposeModel(this.model);
        this.model = null;
      }
      return;
    }
    if (this.activeStage === stage && (this.readyStage === stage || this.modelLoad)) return;
    this.activeStage = stage;
    this.readyStage = null;
    const generation = ++this.loadGeneration;

    if (this.model) {
      this.scene.remove(this.model);
      disposeModel(this.model);
      this.model = null;
    }

    this.modelLoad = this.loader.loadAsync(stageScene.url).then((result) => {
      if (generation !== this.loadGeneration || this.activeStage !== stage) {
        disposeModel(result.scene);
        return;
      }
      const model = result.scene;
      model.scale.setScalar(stageScene.scale);
      model.position.x = stageScene.offset.x;
      model.position.y = stageScene.offset.y;
      model.position.z = 0;
      model.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.castShadow = false;
        object.receiveShadow = false;
      });
      model.updateMatrixWorld(true);
      this.modelBounds.setFromObject(model);
      this.model = model;
      this.scene.add(model);
      this.readyStage = stage;
    }).catch((error: unknown) => {
      console.error(`Native stage load failed for ${stage}`, error);
      if (generation === this.loadGeneration) {
        this.readyStage = null;
        this.activeStage = null;
      }
    }).finally(() => {
      if (generation === this.loadGeneration) this.modelLoad = null;
    });
  }

  async preload(stage: StageId): Promise<boolean> {
    this.prepare(stage);
    await this.modelLoad;
    return this.isReady(stage);
  }

  isReady(stage: StageId): boolean {
    return this.readyStage === stage && this.model !== null;
  }

  render(
    stage: StageId,
    cameraState: StageCameraState,
    width: number,
    height: number,
    devicePixelRatio: number,
    shake: ScreenShake,
  ): boolean {
    this.prepare(stage);
    if (!this.isReady(stage)) return false;

    const ratio = Math.min(1.5, Math.max(1, devicePixelRatio));
    if (width !== this.width || height !== this.height || ratio !== this.pixelRatio) {
      this.width = width;
      this.height = height;
      this.pixelRatio = ratio;
      this.renderer.setPixelRatio(ratio);
      this.renderer.setSize(width, height, false);
    }

    const zoom = Math.max(0.001, cameraState.zoom);
    const visibleHeight = height / zoom;
    const visibleWidth = width / zoom;
    const cameraDirection = getStageDefinition(stage).scene?.cameraDirection ?? 1;
    const horizontalFrustum = nativeStageHorizontalFrustum(stage, visibleWidth);
    this.camera.left = horizontalFrustum.left;
    this.camera.right = horizontalFrustum.right;
    this.camera.top = visibleHeight / 2;
    this.camera.bottom = -visibleHeight / 2;
    const sceneDepth = Math.max(1, this.modelBounds.max.z - this.modelBounds.min.z);
    const depthMargin = Math.max(2_000, sceneDepth * 0.05);
    const cameraZ = cameraDirection < 0
      ? this.modelBounds.min.z - depthMargin
      : this.modelBounds.max.z + depthMargin;
    this.camera.near = 1;
    this.camera.far = sceneDepth + depthMargin * 2;
    this.camera.updateProjectionMatrix();
    const cameraX = cameraState.x - shake.x / zoom;
    const cameraY = cameraState.y - visibleHeight * 0.08 + shake.y / zoom;
    this.camera.position.set(cameraX, cameraY, cameraZ);
    this.camera.lookAt(cameraX, cameraY, 0);
    this.renderer.render(this.scene, this.camera);
    return true;
  }

  destroy(): void {
    this.loadGeneration += 1;
    if (this.model) disposeModel(this.model);
    this.model = null;
    this.modelLoad = null;
    this.draco.dispose();
    this.renderer.dispose();
  }
}
