import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { cmakeExecutable, configureArgs, buildArgs } from './cmake.mjs';

const root = path.resolve(import.meta.dirname, '..');
const directory = path.join(root, 'build/native');
const cmake = cmakeExecutable(directory);
for (const args of [
  configureArgs(path.join(root, 'native'), directory),
  buildArgs(directory),
]) {
  const result = spawnSync(cmake, args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error)
    throw new Error(
      `CMake is required with a C++17 compiler: ${result.error.message}`,
    );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
