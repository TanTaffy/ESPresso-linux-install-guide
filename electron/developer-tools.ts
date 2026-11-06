import {
  accessSync,
  constants,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { DeveloperTools } from '../src/model';

export function discoverDeveloperTools(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): DeveloperTools {
  const platform = process.platform;
  const frameworks = path.join(
    env.IDF_TOOLS_PATH ||
      (platform === 'win32' ? 'C:\\Espressif' : path.join(home, '.espressif')),
    'frameworks',
  );
  const installed = [frameworks, path.join(home, 'esp')].flatMap((root) => {
    try {
      return readdirSync(root)
        .filter((name) => /^esp-idf-v/.test(name))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
        .map((name) => path.join(root, name));
    } catch {
      return [];
    }
  });
  const idfPath =
    [env.IDF_PATH, path.join(home, 'esp/esp-idf'), ...installed].find(
      (folder) => folder && existsSync(path.join(folder, 'tools/idf.py')),
    ) ?? null;
  const onPath = (env.PATH || env.Path || '')
    .split(path.delimiter)
    .filter(Boolean)
    .flatMap((directory) =>
      platform === 'win32'
        ? [
            path.join(directory, 'Code.exe'),
            path.resolve(directory, '../Code.exe'),
          ]
        : [path.join(directory, 'code')],
    );
  const standard =
    platform === 'win32'
      ? [
          env.LOCALAPPDATA &&
            path.join(env.LOCALAPPDATA, 'Programs/Microsoft VS Code/Code.exe'),
          env.ProgramFiles &&
            path.join(env.ProgramFiles, 'Microsoft VS Code/Code.exe'),
          env['ProgramFiles(x86)'] &&
            path.join(env['ProgramFiles(x86)'], 'Microsoft VS Code/Code.exe'),
        ]
      : platform === 'darwin'
        ? ['/Applications', path.join(home, 'Applications')].map((root) =>
            path.join(
              root,
              'Visual Studio Code.app/Contents/Resources/app/bin/code',
            ),
          )
        : [
            '/usr/bin/code',
            '/usr/local/bin/code',
            '/snap/bin/code',
            '/usr/share/code/bin/code',
          ];
  const editorPath =
    [env.ESPRESSO_EDITOR, ...onPath, ...standard].find((file) => {
      if (!file || !path.isAbsolute(file)) return false;
      try {
        if (!statSync(file).isFile()) return false;
        if (platform !== 'win32') accessSync(file, constants.X_OK);
        return true;
      } catch {
        return false;
      }
    }) ?? null;
  return { idfPath, editorPath, platform };
}

export function developerTools(): DeveloperTools {
  return discoverDeveloperTools();
}

export async function openInEditor(folder: string) {
  const executable = developerTools().editorPath;
  if (!executable)
    throw new Error(
      'VS Code was not found. Open the exported folder in your editor.',
    );
  await new Promise<void>((resolve, reject) => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(executable, ['--new-window', folder], {
      shell: false,
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
      env,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
