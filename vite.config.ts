import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Connect } from "vite";
import {
  findForbiddenAssetsInDirectory,
  isBlockedPublicRuntimeRequestPath,
} from "./scripts/public_asset_boundary.mjs";

interface Open2DMetadataDocument {
  fighters: Record<string, Record<string, unknown>>;
}

interface Open3DManifestDocument {
  fighters: Record<string, { directSlots?: string[] }>;
}

const root = fileURLToPath(new URL(".", import.meta.url));
const open2DAssetsRoot = fileURLToPath(
  new URL("./public/assets/characters/open/", import.meta.url),
);
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
    Object.keys(slots).length === runtimeAnimationSlots.length &&
      hasCompleteAtlasSet(fighter),
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

const publicRuntimeBoundary: Connect.NextHandleFunction = (request, response, next) => {
  if (!isBlockedPublicRuntimeRequestPath(request.url ?? "")) {
    next();
    return;
  }
  response.statusCode = 404;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end("This path is not part of the public runtime.");
};

export default defineConfig(({ command }) => ({
  plugins: [{
    name: "super-bash-folds-public-asset-boundary",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(publicRuntimeBoundary);
    },
    configurePreviewServer(server) {
      server.middlewares.use(publicRuntimeBoundary);
    },
    closeBundle() {
      if (command !== "build") return;
      const forbidden = findForbiddenAssetsInDirectory(`${root}/dist`);
      if (forbidden.length > 0) {
        throw new Error(
          `The public build contains non-redistributable asset paths:\n${forbidden.join("\n")}`,
        );
      }
    },
  }],
  define: {
    __OPEN_2D_RUNTIME_CONTENT__: JSON.stringify({
      metadata: open2DMetadata,
    }),
    __OPEN_3D_ATLAS_COMPLETENESS__: JSON.stringify(open3DAtlasComplete),
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
