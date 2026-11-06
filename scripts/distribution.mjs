import path from 'node:path';

export function distribution(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && arch === 'x64')
    return {
      flag: '--win',
      target: 'portable',
      label: 'Windows',
      extension: 'exe',
    };
  if ((arch === 'x64' || arch === 'arm64') && platform === 'darwin')
    return {
      flag: '--mac',
      target: 'zip',
      label: `macOS-${arch}`,
      extension: 'zip',
    };
  if ((arch === 'x64' || arch === 'arm64') && platform === 'linux')
    return {
      flag: '--linux',
      target: 'tar.gz',
      label: `Linux-${arch}`,
      extension: 'tar.gz',
    };
  return null;
}

export function releaseFilename(
  version,
  platform = process.platform,
  arch = process.arch,
) {
  const target = distribution(platform, arch);
  return target
    ? `ESPresso-${version}-${target.label}.${target.extension}`
    : null;
}

export function packagedApp(
  root = process.cwd(),
  platform = process.platform,
  arch = process.arch,
) {
  if (!distribution(platform, arch))
    throw new Error(`Unsupported package: ${platform}/${arch}`);
  if (platform === 'win32')
    return path.resolve(root, 'release/win-unpacked/ESPresso.exe');
  if (platform === 'darwin')
    return path.resolve(
      root,
      arch === 'arm64' ? 'release/mac-arm64' : 'release/mac',
      'ESPresso.app/Contents/MacOS/ESPresso',
    );
  return path.resolve(
    root,
    arch === 'arm64'
      ? 'release/linux-arm64-unpacked'
      : 'release/linux-unpacked',
    'espresso-desktop',
  );
}
