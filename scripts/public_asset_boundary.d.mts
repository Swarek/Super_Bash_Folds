export const PRIVATE_FIGHTERS: readonly string[];
export const PRIVATE_PUBLIC_PREFIXES: readonly string[];
export const PRIVATE_DEVELOPMENT_PREFIXES: readonly string[];
export function assertPrivateOverlayReady(options: {
  missingFiles?: readonly string[];
  missingFighters?: readonly string[];
  problems?: readonly string[];
}): void;
export function isPrivatePublicAssetPath(value: string): boolean;
export function isPrivateDevelopmentRequestPath(value: string): boolean;
export function isBlockedPublicRuntimeRequestPath(value: string): boolean;
export function findPrivateAssetsInDirectory(directory: string): string[];
export function purgePrivateAssetsFromDirectory(directory: string): string[];
