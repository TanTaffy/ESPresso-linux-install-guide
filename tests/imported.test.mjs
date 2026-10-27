import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const call = (value) =>
  JSON.parse(
    execFileSync('build/native/Release/espresso-core.exe', [], {
      input: JSON.stringify(value),
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 24 * 1024 * 1024,
    }),
  );
const request = (value) => {
  const r = call(value);
  assert.equal(r.ok, true, r.error);
  return r.result;
};
const task = (id) => ({
  id,
  kind: 'task',
  name: id,
  symbol: id,
  position: { x: 0, y: 0 },
  periodMs: 100,
  priority: 2,
  stackBytes: 4096,
  core: 'any',
  libraryIds: ['sensor'],
  parameters: [
    { name: 'PIN', type: 'int', value: '11', label: 'Pin', description: '' },
  ],
  setup: [],
  loop: [
    {
      id: id + '-read',
      kind: 'read',
      name: 'Read sample',
      note: '',
      structId: 'samples',
      localName: 'sample',
    },
    {
      id: id + '-process',
      kind: 'placeholder',
      name: 'Process',
      note: 'Process sample',
    },
  ],
});
function fixture() {
  const p = {
    version: 1,
    name: 'protected',
    target: 'esp32s3',
    nodes: [
      task('adc'),
      {
        id: 'samples',
        kind: 'struct',
        name: 'Samples',
        symbol: 'samples',
        typeName: 'Samples',
        position: { x: 200, y: 0 },
        fields: [
          { id: 'value', name: 'value', type: 'int32_t', initialValue: '0' },
        ],
      },
    ],
    types: [
      {
        id: 'T',
        name: 'Payload',
        kind: 'struct',
        fields: [],
        values: [],
        cppType: '',
        headers: [],
        libraryIds: [],
      },
    ],
    libraries: [
      {
        id: 'sensor',
        name: 'Sensor',
        source: 'local',
        version: 'local',
        headers: ['Sensor.hpp'],
        dependencies: [],
        files: { 'Sensor.hpp': '#pragma once\n' },
      },
    ],
  };
  const folder = request({
    op: 'export',
    project: p,
    path: fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-locks-')),
  }).path;
  const source = path.join(folder, 'main/tasks/adc_task.cpp');
  const code = fs
    .readFileSync(source, 'utf8')
    .replace('// TODO: Process sample', 'sample.value += 17;');
  fs.writeFileSync(source, code);
  const imported = request({
    op: 'import-project',
    path: path.join(folder, 'espresso.project.json'),
  }).project;
  return { p: imported, code, folder };
}
test('imported flow, interfaces, existing data and dependencies are protected', () => {
  const { p } = fixture();
  const edits = [
    (p) => p.nodes.splice(0, 1),
    (p) => p.nodes.splice(1, 1),
    (p) => (p.nodes[0].symbol = 'other'),
    (p) => (p.nodes[0].trigger = 'notification'),
    (p) => p.nodes[0].loop.reverse(),
    (p) => (p.nodes[0].loop[0].name = 'different'),
    (p) => (p.nodes[0].loop[0].localName = 'different'),
    (p) => p.nodes[0].loop.shift(),
    (p) =>
      p.nodes[0].loop.push({
        id: 'extra',
        kind: 'placeholder',
        name: 'Extra',
        note: '',
      }),
    (p) => (p.nodes[0].parameters[0].name = 'OTHER'),
    (p) => (p.nodes[0].parameters[0].type = 'unsigned'),
    (p) => (p.nodes[0].parameters = []),
    (p) => (p.nodes[0].libraryIds = []),
    (p) => (p.nodes[1].symbol = 'other'),
    (p) => (p.nodes[1].fields = []),
    (p) => (p.nodes[1].delivery = 'queue'),
    (p) => (p.types = []),
    (p) => (p.types[0].name = 'Other'),
    (p) => (p.libraries = []),
    (p) => (p.libraries[0].name = 'Other'),
    (p) => (p.target = 'esp32'),
  ];
  for (const edit of edits) {
    const changed = structuredClone(p);
    edit(changed);
    const result = call({ op: 'preview', project: changed });
    if (result.ok) {
      assert.equal(result.result.valid, false, String(edit));
      assert.ok(result.result.diagnostics.some((d) => d.severity === 'error'));
    } else assert.ok(result.error);
  }
});
test('new input/output connections export guidance without rewriting imported files and stay pending after reimport', () => {
  const { p, code } = fixture();
  p.nodes[0].name = 'Pressure';
  p.nodes[0].position.x = 100;
  p.nodes[0].periodMs = 25;
  p.nodes[0].parameters[0].value = '12';
  p.nodes[0].parameters.push({
    name: 'BAUD',
    type: 'int',
    value: '9600',
    label: '',
    description: '',
  });
  const gps = task('gps');
  gps.libraryIds = [];
  gps.parameters = [];
  gps.loop = [];
  p.nodes.push(gps);
  const read = {
    id: 'new-input',
    kind: 'read',
    name: 'Extra input',
    note: '',
    structId: 'samples',
    localName: 'extra',
    requiresCode: true,
  };
  const write = {
    id: 'new-output',
    kind: 'write',
    name: 'Extra output',
    note: '',
    structId: 'samples',
    localName: 'out',
    requiresCode: true,
  };
  p.nodes[0].loop.unshift(read);
  p.nodes[0].loop.push(write);
  let preview = request({ op: 'preview', project: p });
  assert.equal(preview.valid, true, JSON.stringify(preview.diagnostics));
  assert.equal(preview.files['main/tasks/adc_task.cpp'], code);
  assert.match(
    preview.connectionCode[read.id],
    /#include "shared\/samples.hpp"[\s\S]*read_samples\(\)/,
  );
  assert.match(preview.connectionCode[write.id], /write_samples\(out\)/);
  assert.match(preview.files['connection-updates.md'], /read_samples/);
  assert.match(preview.configContent, /PERIOD_MS = 25/);
  assert.match(preview.configContent, /PIN = 12/);
  const folder = request({
    op: 'export',
    project: p,
    path: fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-locked-export-')),
  }).path;
  const again = request({
    op: 'import-project',
    path: path.join(folder, 'espresso.project.json'),
  }).project;
  assert.equal(again.nodes[0].name, 'Pressure');
  assert.equal(again.nodes[0].loop[0].requiresCode, true);
  preview = request({ op: 'preview', project: again });
  assert.equal(preview.valid, true);
  assert.equal(preview.files['main/tasks/adc_task.cpp'], code);
  assert.ok(preview.connectionCode[read.id]);
  again.nodes[0].loop.find((s) => s.id === read.id).requiresCode = false;
  again.nodes[0].loop.find((s) => s.id === write.id).requiresCode = false;
  preview = request({ op: 'preview', project: again });
  assert.equal(preview.valid, true);
  assert.deepEqual(preview.connectionCode, {});
  assert.equal(preview.files['connection-updates.md'], undefined);
  const edited = structuredClone(again);
  edited.nodes[0].loop.shift();
  assert.equal(request({ op: 'preview', project: edited }).valid, false);
});

test('edited generated files are rejected at import so supported additions remain available', () => {
  const { folder } = fixture();
  const generated = path.join(folder, 'main/generated/task_runtime.cpp');
  fs.appendFileSync(generated, '\n// custom runtime edit\n');
  const result = call({
    op: 'import-project',
    path: path.join(folder, 'espresso.project.json'),
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /generated file changed/);
});
