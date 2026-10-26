import { _electron as electron, expect } from '@playwright/test';
import electronBinary from 'electron';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-import-ui-'));
const request = (value) => {
  const response = JSON.parse(
    execFileSync('build/native/Release/espresso-core.exe', [], {
      input: JSON.stringify(value),
      encoding: 'utf8',
      windowsHide: true,
    }),
  );
  assert.equal(response.ok, true, response.error);
  return response.result;
};
const project = request({
  op: 'load',
  path: path.resolve('examples/pressure-node.espresso.json'),
}).project;
for (const task of project.nodes)
  if (task.kind === 'task') {
    task.libraryIds = [];
    if (task.symbol === 'can') {
      delete project.code[`includes-${Buffer.from(task.id).toString('hex')}`];
      delete project.code[`loopvars-${Buffer.from(task.id).toString('hex')}`];
    }
  }
const original = request({ op: 'export', project, path: data }).path;
const source = path.join(original, 'main/tasks/adc_task.cpp');
const key = `step-${Buffer.from(project.nodes[0].loop[0].id).toString('hex')}`;
fs.writeFileSync(
  source,
  fs
    .readFileSync(source, 'utf8')
    .replace(
      new RegExp(
        `(// espresso:begin ${key}\\n)[\\s\\S]*?(?= *// espresso:end ${key})`,
      ),
      '$1    pressure.raw_count = 123;\n',
    ),
);
const libraryFolder = path.join(data, 'MSM_LiveData');
fs.mkdirSync(libraryFolder);
fs.writeFileSync(
  path.join(libraryFolder, 'MSM_LiveData.hpp'),
  '#pragma once\nnamespace MSM_LiveData { void publish(); }\n',
);
fs.writeFileSync(
  path.join(libraryFolder, 'MSM_LiveData.cpp'),
  '#include "MSM_LiveData.hpp"\nvoid MSM_LiveData::publish() {}\n',
);
const env = { ...process.env, ESPRESSO_TEST_DATA: path.join(data, 'profile') };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath: process.env.ESPRESSO_E2E_BINARY || electronBinary,
  args: process.env.ESPRESSO_E2E_BINARY ? [] : [path.resolve('.')],
  env,
  cwd: path.resolve('.'),
  timeout: 30000,
});
const page = await app.firstWindow(),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await app.evaluate(
    ({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    },
    path.join(original, 'espresso.project.json'),
  );
  await page
    .getByRole('button', { name: 'Import project', exact: true })
    .click();
  await page
    .getByText('Project imported. Code preserved as a snapshot.', {
      exact: true,
    })
    .waitFor();
  await page.getByRole('button', { name: 'Edit ADC', exact: true }).click();
  await expect(
    page.getByRole('button', {
      name: /Read pressure channel Code placeholder · Code present/,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: /Read pressure channel Code placeholder · Code present/,
    })
    .click();
  await page.locator('.imported-code summary').click();
  await expect(page.locator('.imported-code pre')).toContainText(
    'pressure.raw_count = 123;',
  );
  await page.getByRole('button', { name: 'Libraries', exact: true }).click();
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, libraryFolder);
  await page.getByRole('button', { name: 'Local folder', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Library name', exact: true }),
  ).toHaveValue('MSM_LiveData');
  await page
    .getByRole('textbox', { name: 'Library dependencies', exact: true })
    .fill('freertos');
  await page.getByRole('button', { name: 'Save library', exact: true }).click();
  await page
    .getByText('Library saved. Assign it under Task steps.', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Task steps', exact: true }).click();
  await page
    .getByRole('checkbox', {
      name: 'Give ADC access to MSM_LiveData',
      exact: true,
    })
    .check();
  const output = path.join(data, 'reexport');
  fs.mkdirSync(output);
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, output);
  await page
    .getByRole('button', { name: 'Export skeleton', exact: true })
    .click();
  await page.getByText('Ready to export', { exact: false }).waitFor();
  await page
    .getByRole('button', { name: 'Choose folder & export', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Open folder', exact: true })
    .waitFor();
  const generated = fs.readFileSync(
    path.join(output, 'pressure-node/main/tasks/adc_task.cpp'),
    'utf8',
  );
  assert.match(generated, /pressure.raw_count = 123/);
  assert.match(generated, /#include "MSM_LiveData.hpp"/);
  assert.ok(
    fs.existsSync(
      path.join(
        output,
        'pressure-node/components/MSM_LiveData/MSM_LiveData.cpp',
      ),
    ),
  );
  assert.ok(
    request({
      op: 'import-project',
      path: path.join(output, 'pressure-node/espresso.project.json'),
    }).project.code[key].includes('123'),
  );
  fs.mkdirSync('test-results', { recursive: true });
  await page.getByRole('button', { name: 'Libraries', exact: true }).click();
  await page.screenshot({ path: 'test-results/libraries.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ projectImportAndLibraryManager: true, output }));
} finally {
  await app
    .evaluate(({ app }) => {
      app.exit(0);
    })
    .catch(() => {});
  await app.close().catch(() => {});
}
