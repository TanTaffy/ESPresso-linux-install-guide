import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';

const compiled = await build({
  entryPoints: ['electron/developer-tools.ts', 'src/build-commands.ts'],
  bundle: true,
  write: false,
  outdir: 'unused',
  format: 'esm',
  platform: 'node',
});
const modules = await Promise.all(
  compiled.outputFiles.map(
    (file) =>
      import(
        `data:text/javascript;base64,${Buffer.from(file.text).toString('base64')}`
      ),
  ),
);
const { discoverDeveloperTools } = modules.find(
  (module) => module.discoverDeveloperTools,
);
const { buildCommands } = modules.find((module) => module.buildCommands);

test('SDK and editor discovery accepts environment paths with spaces', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso tools '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sdk = path.join(root, 'SDK with spaces');
  fs.mkdirSync(path.join(sdk, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(sdk, 'tools/idf.py'), '');
  const editor = path.join(
    root,
    process.platform === 'win32' ? 'Code.exe' : 'code',
  );
  fs.writeFileSync(editor, '#!/bin/sh\n');
  fs.chmodSync(editor, 0o755);
  const tools = discoverDeveloperTools(
    { IDF_PATH: sdk, ESPRESSO_EDITOR: editor, PATH: '' },
    root,
  );
  assert.deepEqual(tools, {
    platform: process.platform,
    idfPath: sdk,
    editorPath: editor,
  });
  const fromPath = discoverDeveloperTools({ IDF_PATH: sdk, PATH: root }, root);
  assert.equal(fromPath.editorPath, editor);
});

test('SDK discovery checks conventional folders and prefers newer installed versions', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-sdk-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const version of ['5.5', '5.10']) {
    const directory = path.join(
      root,
      'frameworks',
      `esp-idf-v${version}`,
      'tools',
    );
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'idf.py'), '');
  }
  assert.equal(
    discoverDeveloperTools({ IDF_TOOLS_PATH: root, PATH: '' }, root).idfPath,
    path.join(root, 'frameworks/esp-idf-v5.10'),
  );
});

test('build commands quote PowerShell paths and activate the Windows SDK', () => {
  assert.equal(
    buildCommands('esp32s3', "C:\\My project's output", {
      platform: 'win32',
      idfPath: "C:\\SDK's folder",
      editorPath: null,
    }),
    ". 'C:\\SDK''s folder\\export.ps1'\nSet-Location -LiteralPath 'C:\\My project''s output'\nidf.py set-target esp32s3\nidf.py build",
  );
});

test('Bash/Zsh commands preserve quotes, spaces and shell metacharacters', () => {
  for (const platform of ['darwin', 'linux']) {
    const folder = "/tmp/My project's $(printf bad) output";
    const commands = buildCommands('esp32', folder, {
      platform,
      idfPath: "/opt/SDK's folder",
      editorPath: null,
    });
    assert.ok(commands.startsWith(". '/opt/SDK'\\''s folder/export.sh'\n"));
    const cd = commands.split('\n')[1];
    // Exercise the shell parser without changing directory or running SDK commands.
    if (process.platform !== 'win32')
      assert.equal(
        execFileSync('/bin/sh', ['-c', cd.replace('cd -- ', 'printf %s ')], {
          encoding: 'utf8',
        }),
        folder,
      );
    assert.ok(commands.endsWith('idf.py set-target esp32\nidf.py build'));
  }
  assert.equal(
    buildCommands('esp32', null, null),
    'idf.py set-target esp32\nidf.py build',
  );
});
