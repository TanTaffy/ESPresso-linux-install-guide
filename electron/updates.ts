import type { AppUpdate } from '../src/model';

const repository = 'https://github.com/Trovix/ESPresso';
export const releasesApi =
  'https://api.github.com/repos/Trovix/ESPresso/releases/latest';

function versionParts(version: string) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) return null;
  const parts = version.split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

export function availableUpdate(
  current: string,
  value: unknown,
): AppUpdate | null {
  if (!value || typeof value !== 'object') return null;
  const release = value as Record<string, unknown>;
  if (release.draft !== false || release.prerelease !== false) return null;
  if (typeof release.tag_name !== 'string') return null;
  const version = release.tag_name.replace(/^v/, '');
  const next = versionParts(version),
    installed = versionParts(current);
  if (!next || !installed) return null;
  const difference = next.findIndex((part, index) => part !== installed[index]);
  if (difference < 0 || next[difference] < installed[difference]) return null;
  const filename = `ESPresso-${version}-Windows.exe`;
  const url = `${repository}/releases/download/${release.tag_name}/${filename}`;
  if (
    !Array.isArray(release.assets) ||
    !release.assets.some(
      (asset) =>
        asset &&
        asset.name === filename &&
        asset.state === 'uploaded' &&
        asset.size > 0 &&
        asset.browser_download_url === url,
    )
  )
    return null;
  return { version, url };
}

export async function checkForUpdate(
  current: string,
  fetchRelease: (url: string, options: RequestInit) => Promise<Response>,
): Promise<AppUpdate | null> {
  try {
    const response = await fetchRelease(releasesApi, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `ESPresso/${current}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    return availableUpdate(current, await response.json());
  } catch {
    // Offline, rate-limited or invalid responses must not interrupt editing.
    return null;
  }
}
