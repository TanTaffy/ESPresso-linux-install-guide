import { existsSync, readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { buildConfiguration } from './native-paths.mjs';

export function cmakeExecutable(buildDirectory = path.resolve('build/native')) {
  if (process.env.CMAKE) return process.env.CMAKE;
  try {
    const cache = readFileSync(
      path.join(buildDirectory, 'CMakeCache.txt'),
      'utf8',
    );
    const cached = cache.match(/^CMAKE_COMMAND:INTERNAL=(.+)$/m)?.[1].trim();
    if (cached && existsSync(cached)) return cached;
  } catch {
    // A fresh build has no cache yet.
  }
  const probe = spawnSync('cmake', ['--version'], { windowsHide: true });
  if (!probe.error && probe.status === 0) return 'cmake';
  if (process.platform === 'win32') {
    const vswhere = path.join(
      process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)',
      'Microsoft Visual Studio/Installer/vswhere.exe',
    );
    if (existsSync(vswhere)) {
      const installation = execFileSync(
        vswhere,
        [
          '-latest',
          '-products',
          '*',
          '-requires',
          'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
          '-property',
          'installationPath',
        ],
        { encoding: 'utf8', windowsHide: true },
      ).trim();
      const bundled = path.join(
        installation,
        'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe',
      );
      if (existsSync(bundled)) return bundled;
    }
  }
  return 'cmake';
}

export function configureArgs(source, directory, definitions = {}) {
  return [
    '-S',
    path.resolve(source),
    '-B',
    path.resolve(directory),
    `-DCMAKE_BUILD_TYPE=${buildConfiguration}`,
    ...Object.entries(definitions).map(([name, value]) => `-D${name}=${value}`),
  ];
}

export function buildArgs(directory, extra = []) {
  return [
    '--build',
    path.resolve(directory),
    '--config',
    buildConfiguration,
    ...extra,
  ];
}
