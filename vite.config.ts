import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import {
  PRIVATE_FIGHTERS,
  assertPrivateOverlayReady,
  findPrivateAssetsInDirectory,
  isBlockedPublicRuntimeRequestPath,
  purgePrivateAssetsFromDirectory,
} from "./scripts/public_asset_boundary.mjs";

interface Open2DMetadataDocument {
  fighters: Record<string, Record<string, unknown>>;
}

interface Open3DManifestDocument {
  fighters: Record<string, { directSlots?: string[] }>;
}

interface PrivateEffectDocument {
  fighter?: unknown;
  embeddedTextures?: unknown;
  textures?: unknown;
}

const root = fileURLToPath(new URL(".", import.meta.url));
const open2DAssetsRoot = fileURLToPath(
  new URL("./public/assets/characters/open/", import.meta.url),
);
const privateAssetsRoot = fileURLToPath(
  new URL("./public/assets/characters/ultimate-sheets-native/", import.meta.url),
);
const isUsableFile = (path: string): boolean => {
  try {
    return existsSync(path) && statSync(path).isFile() && statSync(path).size > 0;
  } catch {
    return false;
  }
};
const privateContentRequested = process.env.PRIVATE_CONTENT_MODE === "1";
const publicContentForced = process.env.PUBLIC_CONTENT_ONLY === "1";
if (privateContentRequested && publicContentForced) {
  throw new Error(
    "PRIVATE_CONTENT_MODE=1 and PUBLIC_CONTENT_ONLY=1 are incompatible.",
  );
}
const open2DMetadata = JSON.parse(
  readFileSync(`${open2DAssetsRoot}/2d-animation-metadata.json`, "utf8"),
) as Open2DMetadataDocument;
const runtimeAnimationSlots = Object.keys(
  Object.values(open2DMetadata.fighters)[0] ?? {},
);
const hasCompleteAtlasSet = (fighter: string): boolean =>
  runtimeAnimationSlots.length === 50 &&
  runtimeAnimationSlots.every((slot) =>
    existsSync(`${open2DAssetsRoot}/${fighter}/00/${slot}.webp`)
  ) &&
  existsSync(`${root}/public/assets/ui/fighters/${fighter}/select/00.png`);
const open2DAtlasComplete = Object.fromEntries(
  Object.entries(open2DMetadata.fighters).map(([fighter, slots]) => [
    fighter,
    Object.keys(slots).length === runtimeAnimationSlots.length && hasCompleteAtlasSet(fighter),
  ]),
);
const open3DManifest = JSON.parse(
  readFileSync(`${root}/scripts/open_fighter_pipeline/manifest.json`, "utf8"),
) as Open3DManifestDocument;
const open3DAtlasComplete = Object.fromEntries(
  Object.keys(open3DManifest.fighters).map((fighter) => [
    fighter,
    hasCompleteAtlasSet(fighter),
  ]),
);
const openFighterRuntimeStatus = {
  ...Object.fromEntries(
    Object.entries(open2DMetadata.fighters).map(([fighter, slots]) => [fighter, {
      visualReady: Boolean(open2DAtlasComplete[fighter]),
      productionReady: Boolean(open2DAtlasComplete[fighter]) &&
        Object.values(slots).every((slot) =>
          typeof slot === "object" && slot !== null &&
          "coverage" in slot && slot.coverage === "direct"
        ),
    }]),
  ),
  ...Object.fromEntries(
    Object.entries(open3DManifest.fighters).map(([fighter, definition]) => [fighter, {
      visualReady: Boolean(open3DAtlasComplete[fighter]),
      productionReady: Boolean(open3DAtlasComplete[fighter]) &&
        definition.directSlots?.length === runtimeAnimationSlots.length,
    }]),
  ),
};
const privateAnimationAvailability = !privateContentRequested || !existsSync(privateAssetsRoot)
  ? {}
  : Object.fromEntries(
    readdirSync(privateAssetsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((fighter) => {
        const fighterRoot = `${privateAssetsRoot}/${fighter.name}`;
        const skins = Object.fromEntries(
          readdirSync(fighterRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((skin) => [
              skin.name,
              readdirSync(`${fighterRoot}/${skin.name}`)
                .filter((name) => name.endsWith(".webp"))
                .map((name) => name.slice(0, -5)),
            ]),
        );
        return [fighter.name, skins];
      }),
  );
const privateFighterIds = Object.entries(privateAnimationAvailability)
  .filter(([fighter, skins]) =>
    fighter !== "ice-climbers-nana" &&
    isUsableFile(`${root}/public/assets/ui/fighters/${fighter}/select/00.png`) &&
    runtimeAnimationSlots.every((slot) =>
      skins["00"]?.includes(slot) &&
      isUsableFile(`${privateAssetsRoot}/${fighter}/00/${slot}.webp`)
    )
  )
  .map(([fighter]) => fighter);

const privateSfxFiles = [
  "boot-intro", "dodge", "grab", "hit-heavy", "hit-light", "hit-medium",
  "item-bomb", "item-bumper", "item-fire", "item-pickup", "item-pitfall",
  "item-power", "item-ray", "item-reflect", "item-shell", "item-slip",
  "item-spawn", "ko", "land", "ledge", "menu-back", "menu-confirm",
  "menu-move", "projectile", "respawn", "shield-break", "shield", "throw",
  "water-push",
];
const privateItemFiles = [
  "banana-peel", "beam-sword", "bob-omb", "bumper", "bunny-hood",
  "deku-nut", "fire-flower", "franklin-badge", "green-shell",
  "heart-container", "home-run-bat", "maxim-tomato", "metal-box",
  "motion-sensor-bomb", "pitfall", "ray-gun", "smoke-ball",
  "super-mushroom", "super-star", "timer",
];
const privateStageFiles = ["battlefield", "pokemon-stadium", "hyrule-castle"]
  .flatMap((stage) => [
    `public/assets/stages/${stage}/arena.webp`,
    `public/assets/stages/${stage}/backdrop.webp`,
    `public/assets/stages/${stage}/preview.png`,
    `public/assets/stages/${stage}/preview.thumb.webp`,
    `public/assets/stages/${stage}/scene.glb`,
    `public/assets/stages/${stage}/scene.json`,
  ]);
const privatePortraitFiles = PRIVATE_FIGHTERS.flatMap((fighter) =>
  ["00", "01", "02", "03"].map((skin) =>
    `public/assets/ui/fighters/${fighter}/select/${skin}.png`
  )
);
const privateNanaAtlasFiles = runtimeAnimationSlots.map((slot) =>
  `public/assets/characters/ultimate-sheets-native/ice-climbers-nana/00/${slot}.webp`
);

const privateOverlayProblems: string[] = [];
const privateEffectFiles = new Set<string>();
const collectEffectUrls = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value)) {
    privateOverlayProblems.push(`${label} must be an array`);
    return [];
  }
  const urls: string[] = [];
  for (const [index, entry] of value.entries()) {
    if (
      typeof entry !== "string" ||
      !entry.startsWith("/assets/effects/ultimate/") ||
      entry.includes("..") ||
      /[?#]/.test(entry)
    ) {
      privateOverlayProblems.push(`${label}[${index}] is not a valid private effect URL`);
      continue;
    }
    urls.push(entry);
    privateEffectFiles.add(`public${entry}`);
  }
  return urls;
};

if (privateContentRequested) {
  const commonPath = `${root}/public/assets/effects/ultimate/common.json`;
  const fightersPath = `${root}/public/assets/effects/ultimate/fighters.json`;
  if (isUsableFile(commonPath)) {
    try {
      const common = JSON.parse(readFileSync(commonPath, "utf8")) as PrivateEffectDocument;
      const commonUrls = [
        ...collectEffectUrls(common.embeddedTextures, "common.json:embeddedTextures"),
        ...collectEffectUrls(common.textures ?? [], "common.json:textures"),
      ];
      if (commonUrls.length !== 196 || new Set(commonUrls).size !== 196) {
        privateOverlayProblems.push(
          `common.json must reference 196 unique textures (received: ${commonUrls.length})`,
        );
      }
    } catch (error) {
      privateOverlayProblems.push(`common.json is unreadable: ${String(error)}`);
    }
  }
  if (isUsableFile(fightersPath)) {
    try {
      const fighters = JSON.parse(readFileSync(fightersPath, "utf8")) as unknown;
      if (!Array.isArray(fighters)) {
        privateOverlayProblems.push("fighters.json must be an array");
      } else {
        const fighterIds = fighters.map((entry) =>
          typeof entry === "object" && entry !== null && "fighter" in entry
            ? String(entry.fighter)
            : ""
        );
        const duplicates = fighterIds.filter((fighter, index) =>
          fighter !== "" && fighterIds.indexOf(fighter) !== index
        );
        const missingIds = PRIVATE_FIGHTERS.filter((fighter) => !fighterIds.includes(fighter));
        const unexpectedIds = fighterIds.filter((fighter) =>
          fighter !== "" && !PRIVATE_FIGHTERS.includes(fighter)
        );
        if (duplicates.length > 0) {
          privateOverlayProblems.push(`fighters.json contains duplicates: ${[...new Set(duplicates)].join(", ")}`);
        }
        if (missingIds.length > 0) {
          privateOverlayProblems.push(`fighters.json is missing: ${missingIds.join(", ")}`);
        }
        if (unexpectedIds.length > 0) {
          privateOverlayProblems.push(`fighters.json contains unexpected IDs: ${unexpectedIds.join(", ")}`);
        }
        if (fighterIds.length !== PRIVATE_FIGHTERS.length) {
          privateOverlayProblems.push(
            `fighters.json must contain ${PRIVATE_FIGHTERS.length} manifests (received: ${fighterIds.length})`,
          );
        }
        const fighterUrls = fighters.flatMap((entry, index) => {
          const document = entry as PrivateEffectDocument;
          return [
            ...collectEffectUrls(document.embeddedTextures, `fighters.json[${index}]:embeddedTextures`),
            ...collectEffectUrls(document.textures ?? [], `fighters.json[${index}]:textures`),
          ];
        });
        if (fighterUrls.length !== 1618 || new Set(fighterUrls).size !== 1618) {
          privateOverlayProblems.push(
            `fighters.json must reference 1618 unique textures (received: ${fighterUrls.length})`,
          );
        }
      }
    } catch (error) {
      privateOverlayProblems.push(`fighters.json is unreadable: ${String(error)}`);
    }
  }
}
const requiredPrivateFiles = [
  "public/assets/audio/music/menu.m4a",
  "public/assets/audio/music/smash-battlefield.m4a",
  "public/assets/audio/music/battlefield.m4a",
  "public/assets/audio/music/pokemon-stadium.m4a",
  "public/assets/audio/music/hyrule-castle.m4a",
  ...privateSfxFiles.map((file) => `public/assets/audio/sfx/${file}.wav`),
  ...PRIVATE_FIGHTERS.flatMap((fighter) => [
    `public/assets/audio/fighters/${fighter}/attack.wav`,
    `public/assets/audio/fighters/${fighter}/jump.wav`,
    `public/assets/audio/fighters/${fighter}/victory.wav`,
    `public/assets/audio/announcer/${fighter}.wav`,
  ]),
  ...["ready", "three", "two", "one", "go", "game-set"]
    .map((file) => `public/assets/audio/announcer/${file}.wav`),
  ...privateItemFiles.map((file) => `public/assets/items/${file}.png`),
  "public/assets/ui/cursor/ultimate-open.png",
  "public/assets/ui/cursor/ultimate-pointer.png",
  "public/assets/ui/cursor/ultimate-grab.png",
  "public/assets/effects/ultimate/fighters.json",
  "public/assets/effects/ultimate/common.json",
  "public/assets/effects/ultimate/common/ef_cmn_impact08.png",
  "public/assets/effects/ultimate/common/ef_cmn_line02.png",
  ...privatePortraitFiles,
  ...privateNanaAtlasFiles,
  ...privateEffectFiles,
  ...privateStageFiles,
];
const missingPrivateFiles = requiredPrivateFiles.filter((path) =>
  !isUsableFile(`${root}/${path}`)
);
const missingPrivateFighters = PRIVATE_FIGHTERS.filter((fighter) =>
  !privateFighterIds.includes(fighter)
);
if (privateContentRequested) {
  assertPrivateOverlayReady({
    missingFiles: missingPrivateFiles,
    missingFighters: missingPrivateFighters,
    problems: privateOverlayProblems,
  });
}

const privateContentMode = privateContentRequested;
const publicContentOnly = publicContentForced || !privateContentMode;

export default defineConfig(({ command }) => ({
  plugins: [{
    name: "super-bash-folds-private-asset-boundary",
    enforce: "pre",
    configureServer(server) {
      if (privateContentMode) return;
      server.middlewares.use((request, response, next) => {
        if (!isBlockedPublicRuntimeRequestPath(request.url ?? "")) {
          next();
          return;
        }
        response.statusCode = 404;
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end("Asset reserved for the local private overlay.");
      });
    },
    configurePreviewServer(server) {
      if (privateContentMode) return;
      server.middlewares.use((request, response, next) => {
        if (!isBlockedPublicRuntimeRequestPath(request.url ?? "")) {
          next();
          return;
        }
        response.statusCode = 404;
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end("Asset reserved for the local private overlay.");
      });
    },
    closeBundle() {
      if (command !== "build" || privateContentMode) return;
      const dist = `${root}/dist`;
      purgePrivateAssetsFromDirectory(dist);
      const forbidden = findPrivateAssetsInDirectory(dist);
      if (forbidden.length > 0) {
        throw new Error(
          `The public build still contains private assets:\n${forbidden.join("\n")}`,
        );
      }
    },
  }],
  define: {
    __OPEN_2D_RUNTIME_CONTENT__: JSON.stringify({
      metadata: open2DMetadata,
    }),
    __OPEN_3D_ATLAS_COMPLETENESS__: JSON.stringify(open3DAtlasComplete),
    __PRIVATE_ANIMATION_AVAILABILITY__: JSON.stringify(privateAnimationAvailability),
    __PRIVATE_FIGHTER_IDS__: JSON.stringify(privateFighterIds),
    __PRIVATE_CONTENT_MODE__: JSON.stringify(privateContentMode),
    __PUBLIC_CONTENT_ONLY__: JSON.stringify(publicContentOnly),
    __OPEN_FIGHTER_RUNTIME_STATUS__: JSON.stringify(openFighterRuntimeStatus),
  },
  server: {
    port: 4173,
  },
  preview: {
    port: 4173,
  },
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.local-private/**",
      "website/**",
    ],
  },
}));
