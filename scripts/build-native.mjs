import { existsSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
let cmake = 'cmake';
if (process.platform === 'win32') {
  const vswhere =
    'C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe';
  if (existsSync(vswhere)) {
    const vs = execFileSync(
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
      { encoding: 'utf8' },
    ).trim();
    const bundled = path.join(
      vs,
      'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe',
    );
    if (existsSync(bundled)) cmake = bundled;
  }
}
for (const args of [
  [
    '-S',
    'native',
    '-B',
    'build/native',
    ...(process.platform === 'win32'
      ? ['-G', 'Visual Studio 17 2022', '-A', 'x64']
      : []),
  ],
  ['--build', 'build/native', '--config', 'Release'],
]) {
  const result = spawnSync(cmake, args, { cwd: root, stdio: 'inherit' });
  if (result.error)
    throw new Error(
      `CMake is required with a C++17 compiler: ${result.error.message}`,
    );
  if (result.status) process.exit(result.status);
}
