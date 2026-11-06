import { nativeExecutable } from '../scripts/native-paths.mjs';
import { expect } from '@playwright/test';
import { launchDesktop } from './electron.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-import-ui-'));
const request = (value) => {
  const response = JSON.parse(
    execFileSync(nativeExecutable(), [], {
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
// This import test covers snapshot connector additions independently of the FIFO example.
const snapshot = project.nodes.find((n) => n.kind === 'struct');
snapshot.delivery = 'snapshot';
delete snapshot.capacity;
project.nodes.find((n) => n.id === 'task-adc').loop.at(-1).kind = 'write';
const can = project.nodes.find((n) => n.id === 'task-can');
can.trigger = 'periodic';
delete can.queueId;
can.loop.unshift({
  id: 'can-read',
  kind: 'read',
  name: 'Read pressure',
  note: '',
  structId: snapshot.id,
  localName: 'pressure',
});
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
const wholeSource = fs
  .readFileSync(source, 'utf8')
  .replace(
    '    // Read parameters::PRESSURE_CHANNEL into pressure.raw_count.',
    '    pressure.raw_count = 123;',
  );
fs.writeFileSync(source, wholeSource);
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
const app = await launchDesktop({
  env,
  cwd: path.resolve('.'),
  timeout: 30000,
});
const page = await app.firstWindow(),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await expect(page.locator('.project-label')).toHaveText('New layout');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Project settings', exact: true })
    .click();
  const setup = page.getByRole('dialog', {
    name: 'Project settings',
    exact: true,
  });
  await setup.getByLabel('Project name', { exact: true }).fill('before-import');
  await setup
    .getByRole('button', { name: 'Apply settings', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Task Drag onto canvas', exact: true })
    .click();
  await page.getByLabel('Task name', { exact: true }).fill('Keep this task');
  const previousLayout = path.join(data, 'before-import.espresso.json');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, previousLayout);
  await page.getByRole('button', { name: 'Save layout', exact: true }).click();
  await expect(page.getByLabel('Unsaved changes', { exact: true })).toHaveCount(
    0,
  );
  const previousBytes = fs.readFileSync(previousLayout, 'utf8');
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, data);
  await page
    .getByRole('button', { name: 'Import edited code', exact: true })
    .click();
  const picker = page.getByRole('dialog', {
    name: 'Import edited project',
    exact: true,
  });
  await picker
    .getByRole('button', { name: 'Choose project folder', exact: true })
    .click();
  await expect(picker.getByRole('alert')).toContainText(
    'No espresso.project.json was found',
  );
  await expect(page.locator('.task-node')).toContainText('Keep this task');
  assert.equal(fs.readFileSync(previousLayout, 'utf8'), previousBytes);
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  });
  await picker
    .getByRole('button', { name: 'Choose project file', exact: true })
    .click();
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.project-label')).toHaveText('before-import');
  await expect(page.getByLabel('Unsaved changes', { exact: true })).toHaveCount(
    0,
  );
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [file],
    });
  }, original);
  await page
    .getByRole('button', { name: 'Import edited code', exact: true })
    .click();
  await picker.screenshot({ path: 'test-results/import-project-picker.png' });
  await page
    .getByRole('button', { name: 'Choose project folder', exact: true })
    .click();
  await page
    .getByText('Project imported. Code preserved as a snapshot.', {
      exact: true,
    })
    .waitFor();
  await expect(
    page.getByLabel('Unsaved changes', { exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      () =>
        JSON.parse(
          fs.readFileSync(
            path.join(data, 'profile/recovery.espresso.json'),
            'utf8',
          ),
        ).sourceFiles?.['main/tasks/adc_task.cpp']?.content,
    )
    .toBe(wholeSource);
  await expect(page.getByTestId('node-task-adc')).toContainText(
    'Imported · Limited functionality',
  );
  await page.getByTestId('node-task-adc').screenshot({
    path: 'test-results/imported-task-node.png',
  });
  await expect(
    page.getByRole('button', { name: 'Delete selected node', exact: true }),
  ).toBeDisabled();
  const edgeCount = await page.locator('.react-flow__edge').count();
  await page
    .locator('.react-flow__edge-interaction')
    .first()
    .dispatchEvent('dblclick');
  await expect(
    page.getByText('Imported connections cannot be removed.', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.react-flow__edge')).toHaveCount(edgeCount);
  await page.getByRole('button', { name: 'Edit ADC', exact: true }).click();
  await page.getByText('Advanced task settings', { exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Task C++ symbol', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('combobox', { name: 'Loop trigger', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('textbox', { name: 'Task name', exact: true }),
  ).toBeEnabled();
  await page
    .getByRole('textbox', { name: 'Task name', exact: true })
    .fill('Pressure sensor');
  await expect(
    page.getByRole('heading', { name: /Pressure sensor task/ }),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Task name', exact: true })
    .fill('ADC');
  await expect(
    page.getByRole('textbox', { name: 'Parameter name 0', exact: true }),
  ).toBeDisabled();
  for (const button of await page
    .getByRole('button', { name: 'Placeholder', exact: true })
    .all())
    await expect(button).toBeDisabled();
  await page
    .getByRole('button', { name: /Read pressure channel Code placeholder/ })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Step name', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('combobox', { name: 'Step type', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', {
      name: 'Delete step Read pressure channel',
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', {
      name: 'Move Read pressure channel down',
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Read latest value', exact: true })
    .last()
    .click();
  await page.getByText('Custom step name', { exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Step name', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByLabel('Connector placement', { exact: true }),
  ).toHaveValue('start');
  await page
    .getByLabel('Connector placement', { exact: true })
    .selectOption('end');
  await expect(page.locator('.placement-badge')).toHaveText('Loop end');
  await page
    .getByLabel('Connector placement', { exact: true })
    .selectOption('start');
  await expect(page.locator('.connection-guide')).toHaveCount(0);
  await page
    .getByRole('textbox', { name: 'Step name', exact: true })
    .fill('Read another pressure sample');
  await expect(page.locator('.connection-guide')).toHaveCount(0);
  await page
    .getByRole('button', {
      name: 'Delete step Read another pressure sample',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Read latest value', exact: true })
    .last()
    .click();
  await page
    .getByRole('button', { name: 'Publish', exact: true })
    .last()
    .click();
  await expect(
    page.getByLabel('Connector placement', { exact: true }),
  ).toHaveValue('end');
  await expect(page.locator('.placement-badge')).toHaveText([
    'Loop start',
    'Loop end',
  ]);
  await expect(
    page.getByText('Imported task files are preserved.', { exact: true }),
  ).toBeVisible();
  await page.locator('.imported-code summary').click();
  await expect(page.locator('.imported-code pre')).toContainText(
    'pressure.raw_count = 123;',
  );
  fs.mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/imported-task.png' });
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
  await page.getByText('Advanced build settings', { exact: true }).click();
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
  await page.getByText('Structure valid', { exact: false }).waitFor();
  await page
    .getByRole('button', { name: 'Choose output folder', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Export skeleton', exact: true })
    .nth(1)
    .click();
  await page
    .getByRole('button', { name: 'Open folder', exact: true })
    .waitFor();
  const generated = fs.readFileSync(
    path.join(output, 'pressure-node/main/tasks/adc_task.cpp'),
    'utf8',
  );
  assert.match(generated, /pressure.raw_count = 123/);
  const originalBody = wholeSource.slice(
    wholeSource.indexOf('{', wholeSource.indexOf('void loop(')) + 1,
    wholeSource.lastIndexOf('}\n\n'),
  );
  assert.ok(generated.includes(originalBody));
  assert.ok(generated.includes('#include "MSM_LiveData.hpp"'));
  assert.ok(generated.includes('#include "generated/adc_connections.hpp"'));
  const connectionHeader = fs.readFileSync(
    path.join(output, 'pressure-node/main/generated/adc_connections.hpp'),
    'utf8',
  );
  assert.match(connectionHeader, /read_pressure\(\)/);
  assert.match(connectionHeader, /write_pressure\(value\)/);
  assert.equal(
    fs.existsSync(path.join(output, 'pressure-node/connection-updates.md')),
    false,
  );
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
    }).project.sourceFiles['main/tasks/adc_task.cpp'].content.includes('123'),
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
