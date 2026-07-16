import { isOpenFighterId, type FighterId } from "./contracts";
import type { AttackEffectMaterial, ImpactTier } from "./effects";
import type { MoveName } from "./roster";

type ParticleKind = "dust" | "smoke" | "spark" | "streak" | "electric" | "star" | "debris" | "ember";
type TransientKind = "ring" | "shockwave" | "impact" | "shield" | "grab" | "throw" | "ledge" | "ko-beam" | "respawn";

interface FighterEffectManifest {
  fighter: FighterId;
  ultimateSource: string;
  embeddedTextures: string[];
  textures: string[];
}

const COMMON_ROOT = "/assets/effects/ultimate/common";

type EffectTint = readonly [red: number, green: number, blue: number];

const ATTACK_EFFECT_TINTS: Readonly<Record<AttackEffectMaterial, EffectTint>> = {
  physical: [255, 244, 199],
  blade: [216, 239, 255],
  fire: [255, 123, 62],
  electric: [255, 232, 92],
  energy: [205, 145, 255],
  water: [128, 229, 255],
  wind: [233, 251, 255],
  heavy: [255, 202, 110],
};

/**
 * Ultimate effect textures are shader inputs, not always display-ready PNGs.
 * Some masks are exported fully opaque on black (notably the green line
 * atlas). On the transparent fighter canvas that black matte becomes a visible
 * rectangle above the 3D stage. Convert only confidently opaque black mattes
 * into straight-alpha sprites while preserving their authored intensity.
 */
export const removeOpaqueEffectMatte = (
  pixels: Uint8ClampedArray,
  tint?: EffectTint,
): boolean => {
  const pixelCount = Math.floor(pixels.length / 4);
  if (pixelCount === 0) return false;
  let opaquePixels = 0;
  let darkOpaquePixels = 0;
  for (let offset = 0; offset < pixelCount * 4; offset += 4) {
    const alpha = pixels[offset + 3] ?? 0;
    if (alpha < 250) continue;
    opaquePixels += 1;
    if (Math.max(pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0) <= 8) {
      darkOpaquePixels += 1;
    }
  }
  if (opaquePixels / pixelCount < 0.98 || darkOpaquePixels / pixelCount < 0.08) {
    return false;
  }

  for (let offset = 0; offset < pixelCount * 4; offset += 4) {
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    const strength = Math.max(red, green, blue);
    if (strength <= 2) {
      pixels[offset] = 0;
      pixels[offset + 1] = 0;
      pixels[offset + 2] = 0;
      pixels[offset + 3] = 0;
      continue;
    }
    if (tint) {
      pixels[offset] = tint[0];
      pixels[offset + 1] = tint[1];
      pixels[offset + 2] = tint[2];
    } else {
      // Untinted common masks feed several materials. Their RGB channels are
      // shader data (often neon green), not authored display colour.
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
    }
    pixels[offset + 3] = strength;
  }
  return true;
};

const COMMON_ATTACK_TEXTURES: Readonly<Record<AttackEffectMaterial, string>> = {
  physical: `${COMMON_ROOT}/ef_cmn_impact08.png`,
  blade: `${COMMON_ROOT}/ef_cmn_line02.png`,
  fire: `${COMMON_ROOT}/ef_cmn_fire01.png`,
  electric: `${COMMON_ROOT}/ef_cmn_lightning01.png`,
  energy: `${COMMON_ROOT}/ef_cmn_aura00.png`,
  water: `${COMMON_ROOT}/ef_cmn_water00.png`,
  wind: `${COMMON_ROOT}/ef_cmn_wind00.png`,
  heavy: `${COMMON_ROOT}/ef_cmn_impact00.png`,
};

const PARTICLE_TEXTURES: Readonly<Record<ParticleKind, string>> = {
  dust: `${COMMON_ROOT}/ef_cmn_smoke17.png`,
  smoke: `${COMMON_ROOT}/ef_cmn_smoke05.png`,
  spark: `${COMMON_ROOT}/ef_cmn_spark04.png`,
  streak: `${COMMON_ROOT}/ef_cmn_line05.png`,
  electric: `${COMMON_ROOT}/ef_cmn_lightning00.png`,
  star: `${COMMON_ROOT}/ef_cmn_flash02.png`,
  debris: `${COMMON_ROOT}/ef_cmn_debris00.png`,
  ember: `${COMMON_ROOT}/ef_cmn_fire01.png`,
};

const TRANSIENT_TEXTURES: Readonly<Record<TransientKind, string>> = {
  ring: `${COMMON_ROOT}/ef_cmn_ring00.png`,
  shockwave: `${COMMON_ROOT}/ef_cmn_shockwave00.png`,
  impact: `${COMMON_ROOT}/ef_cmn_impact08.png`,
  shield: `${COMMON_ROOT}/ef_cmn_shield00.png`,
  grab: `${COMMON_ROOT}/ef_cmn_flash01.png`,
  throw: `${COMMON_ROOT}/ef_cmn_line02.png`,
  ledge: `${COMMON_ROOT}/ef_cmn_flash03.png`,
  "ko-beam": `${COMMON_ROOT}/ef_cmn_line15.png`,
  respawn: `${COMMON_ROOT}/ef_cmn_light00.png`,
};

const MATERIAL_KEYWORDS: Readonly<Record<AttackEffectMaterial, readonly string[]>> = {
  physical: ["impact", "attack", "flash", "line"],
  blade: ["sword", "slash", "trace", "arc", "line"],
  fire: ["fire", "flame", "bomb", "ember"],
  electric: ["elec", "thunder", "spark", "kaminari", "dengeki"],
  energy: ["psi", "pk", "aura", "sphere", "shadow", "flash"],
  water: ["water", "splash", "bubble", "drop"],
  wind: ["wind", "tornado", "smoke", "line"],
  heavy: ["impact", "bomb", "shock", "smoke"],
};

const MOVE_TEXTURE_KEYWORDS: Readonly<Record<MoveName, readonly string[]>> = {
  jab: ["attack", "impact", "line"],
  "dash-attack": ["dash", "wind", "impact"],
  "forward-tilt": ["arc", "trace", "line", "impact"],
  "up-tilt": ["arc", "trace", "line", "impact"],
  "down-tilt": ["arc", "trace", "line", "impact"],
  "forward-smash": ["smash", "arc", "impact", "trace"],
  "up-smash": ["smash", "arc", "impact", "trace"],
  "down-smash": ["smash", "arc", "impact", "trace"],
  "neutral-air": ["arc", "trace", "line", "wind"],
  "forward-air": ["arc", "trace", "line", "impact"],
  "back-air": ["arc", "trace", "line", "impact"],
  "up-air": ["arc", "trace", "line", "impact"],
  "down-air": ["arc", "trace", "line", "impact"],
  "neutral-special": ["aura", "flash", "impact"],
  "side-special": ["line", "wind", "impact"],
  "up-special": ["line", "wind", "impact"],
  "down-special": ["impact", "wind", "aura"],
};

const FIGHTER_MOVE_TEXTURE_KEYWORDS: Readonly<
  Partial<Record<FighterId, Readonly<Partial<Record<MoveName, readonly string[]>>>>>
> = {
  "dr-mario": { "neutral-special": ["mariod_burst", "mariod_color"], "side-special": ["mariod_wind"], "down-special": ["mariod_tornado"] },
  mario: { "neutral-special": ["mario_fire"], "side-special": ["mario_wind", "mario_trace"], "down-special": ["mario_water", "mario_splash"] },
  luigi: { "neutral-special": ["mario_fire"], "side-special": ["luigi_jet"], "down-special": ["luigi_tornado"] },
  bowser: { "neutral-special": ["koopa_fire"], "up-special": ["koopa_wind"], "down-special": ["koopa_impact"] },
  peach: { "neutral-special": ["peach_spothead", "peach_rebbon"], "side-special": ["peach_heart"], "up-special": ["peach_rebbon", "peach_line"], "down-special": ["peach_soil"] },
  yoshi: { "neutral-special": ["yoshi_egg"], "side-special": ["yoshi_spinsonic"], "up-special": ["yoshi_egg"], "down-special": ["yoshi_impactflash"] },
  "donkey-kong": { "neutral-special": ["donkey_arc", "donkey_impact"], "down-special": ["donkey_tornade", "donkey_impact"] },
  "captain-falcon": { "neutral-special": ["captain_fire", "captain_wing"], "side-special": ["captain_fireimpact", "captain_arc"], "up-special": ["captain_fire", "captain_line"], "down-special": ["captain_fire", "captain_line"] },
  ganondorf: { "neutral-special": ["ganon_aura", "ganon_fire"], "side-special": ["ganon_aura", "ganon_impact"], "up-special": ["ganon_lightning"], "down-special": ["ganon_fire", "ganon_wind"] },
  falco: { "neutral-special": ["falco_shot"], "side-special": ["fox_jet", "falco_line"], "up-special": ["cmn_fire", "falco_wind"], "down-special": ["fox_flash", "falco_impact"] },
  fox: { "neutral-special": ["fox_shot"], "side-special": ["fox_jet", "fox_line"], "up-special": ["cmn_fire", "fox_wind"], "down-special": ["fox_flash", "fox_impact"] },
  ness: { "neutral-special": ["ness_pkflash"], "side-special": ["ness_fire"], "up-special": ["ness_pkthunder", "ness_lightning"], "down-special": ["ness_psimagnet", "ness_square"] },
  "ice-climbers": { "neutral-special": ["popo_ice"], "side-special": ["luigi_tornado", "popo_line"], "up-special": ["popo_line"], "down-special": ["popo_ice", "cmn_ice"] },
  kirby: { "neutral-special": ["kirby_tornado", "cmn_wind"], "side-special": ["kirby_onigoroshiarc"], "up-special": ["kirby_cutter"], "down-special": ["kirby_transform", "kirby_impact"] },
  samus: { "neutral-special": ["samus_cshot", "samus_babbule"], "side-special": ["samus_missile", "cmn_fire"], "up-special": ["samus_arc"], "down-special": ["samus_bomb", "cmn_bomb"] },
  zelda: { "neutral-special": ["zelda_arc", "zelda_crystal"], "side-special": ["cmn_fire", "zelda_impact"], "up-special": ["zelda_flash", "cmn_wind"], "down-special": ["zelda_phantom"] },
  sheik: { "neutral-special": ["sheik_line", "sheik_trace"], "side-special": ["sheik_flare", "sheik_impact"], "up-special": ["sheik_flash", "sheik_water"], "down-special": ["sheik_arc"] },
  link: { "neutral-special": ["link_arrow"], "side-special": ["link_boomerang"], "up-special": ["link_sword", "link_wind"], "down-special": ["link_bomb"] },
  "young-link": { "neutral-special": ["younglink_arrow", "younglink_flash"], "side-special": ["younglink_line"], "up-special": ["younglink_kaitengiri", "swordturntrace"], "down-special": ["cmn_fire", "cmn_bomb"] },
  pichu: { "neutral-special": ["pikachu_lightning"], "side-special": ["pikachu_wind"], "up-special": ["pikachu_flashline"], "down-special": ["pikachu_lightning"] },
  pikachu: { "neutral-special": ["pikachu_lightning"], "side-special": ["pikachu_wind"], "up-special": ["pikachu_flashline"], "down-special": ["pikachu_lightning"] },
  jigglypuff: { "neutral-special": ["purin_arc", "purin_line"], "side-special": ["purin_impact"], "up-special": ["purin_song"], "down-special": ["purin_flash", "purin_ring"] },
  mewtwo: { "neutral-special": ["mewtwo_aura", "mewtwo_grade"], "side-special": ["mewtwo_rainbow", "mewtwo_arc"], "up-special": ["mewtwo_flash"], "down-special": ["mewtwo_impact", "mewtwo_aura"] },
  "mr-game-and-watch": { "neutral-special": ["gamewatch_bg"], "side-special": ["gamewatch_bg"], "up-special": ["gamewatch_bg"], "down-special": ["gamewatch_bg"] },
  marth: { "neutral-special": ["marthshieldbreaker", "marth_sword"], "side-special": ["marthcombi", "marth_trace"], "up-special": ["marth_line", "marth_trace"], "down-special": ["marth_flash", "marth_lightning"] },
  roy: { "neutral-special": ["roy_fire", "roy_gauge"], "side-special": ["roy_sword", "roy_streak"], "up-special": ["roy_fire", "roy_sword"], "down-special": ["roy_fire", "roy_flash"] },
};

export const selectOfficialFighterEffectTexture = (
  manifest: FighterEffectManifest | undefined,
  move: MoveName,
  material: AttackEffectMaterial,
): string => {
  if (!manifest) return COMMON_ATTACK_TEXTURES[material];
  const candidates = [...manifest.embeddedTextures, ...manifest.textures];
  const fighterPrefix = `ef_${manifest.ultimateSource.toLowerCase()}_`;
  const moveKeywords = FIGHTER_MOVE_TEXTURE_KEYWORDS[manifest.fighter]?.[move] ?? MOVE_TEXTURE_KEYWORDS[move];
  const keywords = [...moveKeywords, ...MATERIAL_KEYWORDS[material]];
  const scored = candidates
    .map((url, index) => {
      const name = url.toLowerCase().split("/").pop() ?? "";
      const keywordIndex = keywords.findIndex((keyword) => name.includes(keyword));
      const score = keywordIndex < 0 ? 0 :
        (name.startsWith(fighterPrefix) ? 35 : 0) +
        (keywordIndex < moveKeywords.length ? 200 : 80) - keywordIndex - index / 10000;
      return { url, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);
  return scored[0]?.url ?? COMMON_ATTACK_TEXTURES[material];
};

interface DrawOptions {
  x: number;
  y: number;
  width: number;
  height?: number;
  rotation?: number;
  alpha?: number;
  flipX?: boolean;
  additive?: boolean;
}

interface LoadedEffectTexture {
  source: CanvasImageSource | null;
}

export class UltimateEffectSpriteLibrary {
  private readonly images = new Map<string, LoadedEffectTexture>();
  private readonly manifests = new Map<FighterId, FighterEffectManifest>();
  private manifestLoadStarted = false;

  constructor() {}

  drawAttack(
    ctx: CanvasRenderingContext2D,
    fighter: FighterId,
    move: MoveName,
    material: AttackEffectMaterial,
    options: DrawOptions,
  ): boolean {
    if (!__PRIVATE_CONTENT_MODE__) return false;
    // Open fighters must never silently inherit Nintendo-authored textures
    // merely because their own effect manifest is intentionally absent.
    if (isOpenFighterId(fighter)) return false;
    this.ensureFighterManifests();
    const url = selectOfficialFighterEffectTexture(this.manifests.get(fighter), move, material);
    return this.draw(ctx, url, { ...options, additive: true }, ATTACK_EFFECT_TINTS[material]);
  }

  drawParticle(
    ctx: CanvasRenderingContext2D,
    kind: ParticleKind,
    options: DrawOptions,
  ): boolean {
    if (!__PRIVATE_CONTENT_MODE__) return false;
    return this.draw(ctx, PARTICLE_TEXTURES[kind], {
      ...options,
      // Ultimate's decoded effect atlases commonly store glow/smoke RGB on an
      // opaque black background and rely on the emitter blend state. The VFXB
      // blend state is not encoded in the PNG, so source-over would paint the
      // atlas rectangle black over the match.
      additive: true,
    });
  }

  drawTransient(
    ctx: CanvasRenderingContext2D,
    kind: TransientKind,
    tier: ImpactTier,
    options: DrawOptions,
  ): boolean {
    if (!__PRIVATE_CONTENT_MODE__) return false;
    const tierScale = tier === "heavy" ? 1.22 : tier === "medium" ? 1.08 : 1;
    return this.draw(ctx, TRANSIENT_TEXTURES[kind], {
      ...options,
      width: options.width * tierScale,
      height: (options.height ?? options.width) * tierScale,
      additive: true,
    });
  }

  private load(url: string, tint?: EffectTint): LoadedEffectTexture | null {
    const key = tint ? `${url}|${tint.join(",")}` : url;
    const cached = this.images.get(key);
    if (cached) return cached;
    if (typeof Image === "undefined") return null;
    const image = new Image();
    const texture: LoadedEffectTexture = { source: null };
    image.decoding = "async";
    image.onload = () => {
      texture.source = this.prepareSource(image, tint);
    };
    image.src = url;
    this.images.set(key, texture);
    return texture;
  }

  private prepareSource(image: HTMLImageElement, tint?: EffectTint): CanvasImageSource {
    if (typeof document === "undefined") return image;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return image;
    context.drawImage(image, 0, 0);
    try {
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      if (!removeOpaqueEffectMatte(frame.data, tint)) return image;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.putImageData(frame, 0, 0);
      return canvas;
    } catch {
      return image;
    }
  }

  private ensureFighterManifests(): void {
    if (!__PRIVATE_CONTENT_MODE__ || this.manifestLoadStarted || typeof fetch !== "function") return;
    this.manifestLoadStarted = true;
    void fetch("/assets/effects/ultimate/fighters.json")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
      .then((manifests: FighterEffectManifest[]) => {
        for (const manifest of manifests) this.manifests.set(manifest.fighter, manifest);
      })
      .catch(() => undefined);
  }

  private draw(
    ctx: CanvasRenderingContext2D,
    url: string,
    options: DrawOptions,
    tint?: EffectTint,
  ): boolean {
    const texture = this.load(url, tint);
    if (!texture?.source) return false;
    const height = options.height ?? options.width;
    ctx.save();
    ctx.translate(options.x, options.y);
    ctx.rotate(options.rotation ?? 0);
    ctx.scale(options.flipX ? -1 : 1, 1);
    ctx.globalAlpha = options.alpha ?? 1;
    ctx.globalCompositeOperation = options.additive ? "lighter" : "source-over";
    ctx.drawImage(texture.source, -options.width / 2, -height / 2, options.width, height);
    ctx.restore();
    return true;
  }
}
