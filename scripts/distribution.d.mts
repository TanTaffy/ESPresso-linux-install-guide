export function distribution(platform?: string, arch?: string): {
  flag: string;
  target: string;
  label: string;
  extension: string;
} | null;
export function releaseFilename(version: string, platform?: string, arch?: string): string | null;
export function packagedApp(root?: string, platform?: string, arch?: string): string;
