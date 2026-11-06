import path from 'node:path';

export const buildConfiguration = 'Release';

export function executableName(name, platform = process.platform) {
  return `${name}${platform === 'win32' ? '.exe' : ''}`;
}

export function buildExecutable(directory, name, platform = process.platform) {
  return path.resolve(
    directory,
    'bin',
    buildConfiguration,
    executableName(name, platform),
  );
}

export function nativeExecutable(
  root = process.cwd(),
  platform = process.platform,
) {
  return buildExecutable(
    path.join(root, 'build/native'),
    'espresso-core',
    platform,
  );
}

export function packagedNativeExecutable(
  resources,
  platform = process.platform,
) {
  return path.resolve(
    resources,
    'core',
    executableName('espresso-core', platform),
  );
}
