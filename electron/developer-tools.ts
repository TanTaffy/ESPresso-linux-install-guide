import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { DeveloperTools } from '../src/model';

export function developerTools(): DeveloperTools {
  const sdkRoot = path.join(
    process.env.IDF_TOOLS_PATH || 'C:\\Espressif',
    'frameworks',
  );
  let installed: string[] = [];
  try {
    installed = readdirSync(sdkRoot)
      .filter((name) => /^esp-idf-v/.test(name))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map((name) => path.join(sdkRoot, name));
  } catch {
    /* SDK may not be installed. */
  }
  const idfPath =
    [process.env.IDF_PATH, ...installed].find(
      (folder) => folder && existsSync(path.join(folder, 'tools', 'idf.py')),
    ) ?? null;
  const editorPath =
    [
      path.join(
        process.env.LOCALAPPDATA || '',
        'Programs',
        'Microsoft VS Code',
        'Code.exe',
      ),
      path.join(
        process.env.ProgramFiles || '',
        'Microsoft VS Code',
        'Code.exe',
      ),
      path.join(
        process.env['ProgramFiles(x86)'] || '',
        'Microsoft VS Code',
        'Code.exe',
      ),
    ].find((file) => path.isAbsolute(file) && existsSync(file)) ?? null;
  return { idfPath, editorPath };
}

export async function openInEditor(folder: string) {
  const executable = developerTools().editorPath;
  if (!executable)
    throw new Error(
      'VS Code was not found. Open the exported folder in your editor.',
    );
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, ['--new-window', folder], {
      shell: false,
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
