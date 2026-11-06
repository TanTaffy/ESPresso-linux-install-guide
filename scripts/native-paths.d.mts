export const buildConfiguration: 'Release';
export function executableName(name: string, platform?: NodeJS.Platform): string;
export function buildExecutable(
  directory: string,
  name: string,
  platform?: NodeJS.Platform,
): string;
export function nativeExecutable(root?: string, platform?: NodeJS.Platform): string;
export function packagedNativeExecutable(
  resources: string,
  platform?: NodeJS.Platform,
): string;
