/// <reference types="vite/client" />

/** Audited open 2D runtime content injected from public assets by Vite. */
declare const __OPEN_2D_RUNTIME_CONTENT__: unknown;

/** Build-time proof that every expected atlas and portrait exists for each open 3D fighter. */
declare const __OPEN_3D_ATLAS_COMPLETENESS__: unknown;

/** Existing private atlases by fighter, skin and animation slot. */
declare const __PRIVATE_ANIMATION_AVAILABILITY__: unknown;

/** Private fighters whose complete local atlases and portrait are available to this build. */
declare const __PRIVATE_FIGHTER_IDS__: unknown;

/** True only for an explicitly requested and locally validated private overlay. */
declare const __PRIVATE_CONTENT_MODE__: boolean;

/** True for the default distributable runtime; false only in validated private mode. */
declare const __PUBLIC_CONTENT_ONLY__: boolean;

/** Lightweight visual and publication status used by menus before combat code loads. */
declare const __OPEN_FIGHTER_RUNTIME_STATUS__: unknown;
