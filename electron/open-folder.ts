import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { shell } from 'electron';

export async function openFolder(folder: string): Promise<void> {
  const directory = path.resolve(folder);
  if (!(await stat(directory)).isDirectory())
    throw new Error(`Folder does not exist: ${directory}`);
  if (process.platform !== 'win32') {
    const error = await shell.openPath(directory);
    if (error) throw new Error(error);
    return;
  }
  // Open directories explicitly in Explorer. Portable apps must not depend on
  // the default shell association for a directory or its inherited environment.
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      path.join(process.env.SystemRoot || 'C:\\Windows', 'explorer.exe'),
      [directory],
      { shell: false, windowsHide: false, stdio: 'ignore' },
    );
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
