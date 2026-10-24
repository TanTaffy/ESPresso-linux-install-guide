import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const core = path.resolve('build/native/Release/espresso-core.exe');
function request(value) {
  return JSON.parse(
    execFileSync(core, [], {
      input: typeof value === 'string' ? value : JSON.stringify(value),
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
}
const example = () => request({ op: 'example' }).result.project;
const withoutCan = (project) => {
  for (const node of project.nodes)
    if (node.kind === 'task') {
      delete node.preset;
      for (const step of [...node.setup, ...node.loop]) delete step.action;
    }
  return project;
};
test('pressure example generates mutex helpers, setup/loop files and timed wrappers', () => {
  const p = example(),
    r = request({ op: 'preview', project: p });
  assert.equal(r.ok, true);
  assert.equal(r.result.valid, true);
  assert.deepEqual(r.result.diagnostics, []);
  const f = r.result.files;
  assert.match(f['main/tasks/adc_task.cpp'], /data::PressureData pressure\{\}/);
  assert.match(
    f['main/tasks/adc_task.cpp'],
    /shared::write_pressure\(pressure\)/,
  );
  assert.match(
    f['main/tasks/can_task.cpp'],
    /pressure = ::espresso::shared::read_pressure\(\)/,
  );
  assert.match(f['main/generated/task_runtime.cpp'], /pdMS_TO_TICKS\(100\)/);
  assert.match(
    f['main/shared/pressure.cpp'],
    /xSemaphoreTake\(mutex, portMAX_DELAY\)/,
  );
  assert.match(f['sdkconfig.defaults'], /CONFIG_FREERTOS_HZ=1000/);
  assert.deepEqual(JSON.parse(f['espresso.layout.json']), p);
});
test('generation preserves ordering, notes, arbitrary structs and local aliases', () => {
  const p = example();
  const t = p.nodes[0];
  t.periodMs = 25;
  t.loop.unshift({
    id: 'new-placeholder',
    kind: 'placeholder',
    name: 'First step',
    note: 'line one\nline two',
  });
  t.loop.at(-1).localName = 'sample';
  const p2 = structuredClone(p.nodes[1]);
  p2.id = 'struct-temperature';
  p2.symbol = 'temperature';
  p2.name = 'Temperature';
  p2.typeName = 'TemperatureData';
  p2.fields = p2.fields.map((f) => ({ ...f, id: f.id + '-temp' }));
  p.nodes.push(p2);
  t.loop.push({
    id: 'temp-read',
    kind: 'read',
    name: 'Read temperature',
    note: '',
    structId: p2.id,
    localName: 'temp',
  });
  const r = request({ op: 'preview', project: p });
  assert.equal(r.result.valid, true);
  const code = r.result.files['main/tasks/adc_task.cpp'];
  assert.ok(
    code.indexOf('// First step') < code.indexOf('// Read pressure channel'),
  );
  assert.match(code, /\/\/ TODO: line one\n    \/\/ TODO: line two/);
  assert.match(code, /TemperatureData temp\{\}/);
  assert.match(code, /write_pressure\(sample\)/);
  assert.match(
    r.result.files['main/generated/task_runtime.cpp'],
    /pdMS_TO_TICKS\(25\)/,
  );
});
test('identifiers, duplicate types and numeric expressions cannot enter generated C++', () => {
  for (const bad of [
    'class',
    '../escape',
    'bad-name',
    '__reserved',
    'a; system("bad")',
  ]) {
    const p = example();
    p.nodes[0].symbol = bad;
    const r = request({ op: 'preview', project: p });
    assert.equal(r.result.valid, false);
    assert.deepEqual(r.result.files, {});
  }
  const p = example();
  p.nodes[1].fields[0].initialValue = '1; injected()';
  assert.equal(request({ op: 'preview', project: p }).result.valid, false);
  p.nodes[1].fields[0].initialValue = '65536';
  assert.equal(request({ op: 'preview', project: p }).result.valid, false);
  p.nodes[1].fields[0].initialValue = '0001';
  assert.equal(request({ op: 'preview', project: p }).result.valid, false);
});
test('dangling references, conflicting snapshots, timings and core affinity are rejected', () => {
  const p = example();
  p.nodes[0].loop.at(-1).structId = 'missing';
  assert.equal(request({ op: 'preview', project: p }).result.valid, false);
  const p2 = example();
  p2.target = 'esp32c3';
  p2.nodes[0].core = '1';
  assert.equal(request({ op: 'preview', project: p2 }).result.valid, false);
  for (const key of ['periodMs', 'stackBytes', 'priority']) {
    const q = example();
    q.nodes[0][key] = 0;
    assert.equal(request({ op: 'preview', project: q }).result.valid, false);
  }
  const q = example();
  q.nodes[0].loop.at(-1).localName = 'while';
  assert.equal(request({ op: 'preview', project: q }).result.valid, false);
});
test('all supported field types and boundary values generate legal literals', () => {
  const p = example();
  p.nodes[1].fields = [
    {
      id: 'u64',
      name: 'maximum',
      type: 'uint64_t',
      initialValue: '18446744073709551615',
    },
    {
      id: 'i64',
      name: 'minimum',
      type: 'int64_t',
      initialValue: '-9223372036854775808',
    },
    { id: 'float', name: 'voltage', type: 'float', initialValue: '2' },
    { id: 'bool', name: 'ready', type: 'bool', initialValue: 'false' },
  ];
  const r = request({ op: 'preview', project: p });
  assert.equal(r.result.valid, true);
  assert.match(
    r.result.files['main/shared/pressure.hpp'],
    /18446744073709551615ULL/,
  );
  assert.match(r.result.files['main/shared/pressure.hpp'], /voltage = 2.0f/);
  assert.match(
    r.result.files['main/shared/pressure.hpp'],
    /\(-9223372036854775807LL - 1LL\)/,
  );
});
test('save/load round trip includes positions and invalid-but-editable drafts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-save-')),
    p = example(),
    file = path.join(dir, 'pressure.espresso.json');
  p.nodes[0].position = { x: 123, y: 456 };
  p.nodes[0].symbol = '';
  assert.equal(request({ op: 'save', project: p, path: file }).ok, true);
  assert.deepEqual(request({ op: 'load', path: file }).result.project, p);
  p.name = 'updated-project';
  assert.equal(request({ op: 'save', project: p, path: file }).ok, true);
  assert.equal(
    JSON.parse(fs.readFileSync(file, 'utf8')).name,
    'updated-project',
  );
});
test('export creates a complete project and never overwrites an existing directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-export-')),
    p = withoutCan(example());
  const r = request({ op: 'export', project: p, path: dir });
  assert.equal(r.ok, true);
  const destination = path.join(dir, p.name);
  assert.ok(fs.existsSync(path.join(destination, 'main/tasks/adc_task.cpp')));
  assert.ok(fs.existsSync(path.join(destination, 'main/shared/pressure.cpp')));
  fs.writeFileSync(
    path.join(destination, 'main/tasks/adc_task.cpp'),
    'HANDWRITTEN CODE',
  );
  const again = request({ op: 'export', project: p, path: dir });
  assert.equal(again.ok, false);
  assert.equal(
    fs.readFileSync(path.join(destination, 'main/tasks/adc_task.cpp'), 'utf8'),
    'HANDWRITTEN CODE',
  );
  p.name = '../unsafe';
  assert.equal(request({ op: 'export', project: p, path: dir }).ok, false);
});

test('CAN preset is editable, uniquely named, and leaves packet details as TODOs', () => {
  const project = request({ op: 'new' }).result.project;
  const first = request({
    op: 'can-preset',
    project,
    position: { x: 120, y: 240 },
  }).result.task;
  assert.equal(first.preset, 'msm_can');
  assert.equal(first.symbol, 'can');
  assert.deepEqual(first.position, { x: 120, y: 240 });
  assert.equal(first.setup[0].action, 'msm_can_init');
  assert.equal(first.loop.at(-1).action, 'msm_can_send');
  project.nodes.push(first);
  const second = request({
    op: 'can-preset',
    project,
    position: { x: 300, y: 240 },
  }).result.task;
  assert.equal(second.symbol, 'can_2');
  assert.notEqual(first.id, second.id);
  const result = request({ op: 'preview', project }).result;
  assert.equal(result.valid, true);
  assert.match(result.files['main/CMakeLists.txt'], /PRIV_REQUIRES MSM_CAN/);
  assert.match(
    result.files['components/MSM_CAN/CMakeLists.txt'],
    /esp_driver_twai esp_timer freertos/,
  );
  assert.match(
    result.files['main/tasks/can_task.cpp'],
    /MSM_CAN::TxFrame can_frame/,
  );
  assert.match(
    result.files['main/tasks/can_task.cpp'],
    /\/\/ ESP_ERROR_CHECK\(MSM_CAN::init/,
  );
  assert.match(
    result.files['main/tasks/can_task.cpp'],
    /\/\/ ESP_ERROR_CHECK\(MSM_CAN::send_msg/,
  );
  assert.doesNotMatch(
    result.files['main/tasks/can_task.cpp'],
    /can_frame\.id\s*=\s*(?:0x|\d)/,
  );
  const normal = request({
    op: 'preview',
    project: withoutCan(example()),
  }).result;
  assert.equal(
    Object.keys(normal.files).some((name) =>
      name.startsWith('components/MSM_CAN'),
    ),
    false,
  );
});

test(
  'CAN export downloads the latest released source unchanged and records its version',
  { skip: !process.env.ESPRESSO_LIVE_CAN },
  async () => {
    const project = example(),
      parent = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-live-can-'));
    const result = request({ op: 'export', project, path: parent });
    assert.equal(result.ok, true, result.error);
    const lock = JSON.parse(
      fs.readFileSync(
        path.join(result.result.path, 'msm_can.lock.json'),
        'utf8',
      ),
    );
    assert.equal(lock.release, result.result.msmCanVersion);
    assert.match(lock.commit, /^[a-f0-9]{40}$/);
    const sourcePath = lock.sourcePaths['MSM_CAN.cpp'];
    const response = await fetch(
      `https://raw.githubusercontent.com/ManchesterStingerMotorsports/MSM_CAN/${lock.commit}/${sourcePath}`,
    );
    assert.equal(response.status, 200);
    assert.equal(
      fs.readFileSync(
        path.join(result.result.path, 'components/MSM_CAN/MSM_CAN.cpp'),
        'utf8',
      ),
      await response.text(),
    );
  },
);
test('malformed files and unknown schema versions return actionable errors', () => {
  assert.equal(request('{invalid').ok, false);
  const p = example();
  p.version = 22;
  assert.equal(request({ op: 'preview', project: p }).ok, false);
  const p2 = example();
  p2.nodes[0].setup = 'wrong';
  assert.equal(request({ op: 'preview', project: p2 }).ok, false);
});

const sectionKey = (kind, id) => `${kind}-${Buffer.from(id).toString('hex')}`;
function exportedFixture() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-project-'));
  const project = withoutCan(example());
  const result = request({ op: 'export', project, path: parent });
  assert.equal(result.ok, true, result.error);
  return {
    project,
    folder: result.result.path,
    manifest: path.join(result.result.path, 'espresso.project.json'),
  };
}
function editSection(file, key, code) {
  const text = fs.readFileSync(file, 'utf8');
  const pattern = new RegExp(
    `(// espresso:begin ${key}\\n)[\\s\\S]*?(?= *// espresso:end ${key})`,
  );
  assert.match(text, pattern);
  fs.writeFileSync(
    file,
    text.replace(pattern, (_, begin) => begin + code),
  );
}
test('project import preserves code by ID through rename, reorder, save and re-export', () => {
  const { project, folder, manifest } = exportedFixture();
  const step = project.nodes[0].loop[0],
    key = sectionKey('step', step.id);
  const code =
    '    pressure.raw_count = 42;\n    // User implementation, including blank lines.\n\n';
  editSection(path.join(folder, 'main/tasks/adc_task.cpp'), key, code);
  editSection(
    path.join(folder, 'main/tasks/adc_task.cpp'),
    sectionKey('state', 'task-adc'),
    'static int samples = 0;\n',
  );
  const imported = request({ op: 'import-project', path: manifest });
  assert.equal(imported.ok, true, imported.error);
  const p = imported.result.project;
  assert.equal(p.code[key], code);
  p.nodes[0].symbol = 'sensor';
  p.nodes[0].loop.reverse();
  p.nodes[0].loop.find((s) => s.id === step.id).name = 'Renamed implementation';
  const preview = request({ op: 'preview', project: p }).result;
  assert.equal(preview.stepStates[step.id], 'Code present');
  assert.ok(preview.files['main/tasks/sensor_task.cpp'].includes(code));
  assert.match(
    preview.files['main/tasks/sensor_task.cpp'],
    /static int samples = 0/,
  );
  const savePath = path.join(
    os.tmpdir(),
    `espresso-preserved-${Date.now()}.espresso.json`,
  );
  assert.equal(request({ op: 'save', project: p, path: savePath }).ok, true);
  assert.equal(
    request({ op: 'load', path: savePath }).result.project.code[key],
    code,
  );
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-reexport-'));
  const output = request({ op: 'export', project: p, path: parent });
  assert.equal(output.ok, true, output.error);
  assert.equal(
    request({
      op: 'import-project',
      path: path.join(output.result.path, 'espresso.project.json'),
    }).result.project.code[key],
    code,
  );
  p.nodes[0].loop = p.nodes[0].loop.filter((s) => s.id !== step.id);
  const removed = request({ op: 'preview', project: p }).result;
  assert.ok(removed.files['espresso-recovered-code.txt'].includes(code));
  assert.ok(
    removed.diagnostics.some((d) => d.message.includes('Removed sections')),
  );
});
test('project import rejects structural changes, missing markers/files and unsafe inventories', () => {
  for (const change of [
    'structure',
    'marker',
    'missing',
    'extra',
    'path',
    'layout',
  ]) {
    const { folder, manifest } = exportedFixture();
    const file = path.join(folder, 'main/tasks/adc_task.cpp');
    if (change === 'structure')
      fs.appendFileSync(file, 'void unmanaged() {}\n');
    if (change === 'marker')
      fs.writeFileSync(
        file,
        fs
          .readFileSync(file, 'utf8')
          .replace('espresso:end', 'espresso:broken'),
      );
    if (change === 'missing') fs.unlinkSync(file);
    if (change === 'extra')
      fs.writeFileSync(path.join(folder, 'extra.cpp'), 'int unmanaged;');
    if (change === 'path' || change === 'layout') {
      const doc = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (change === 'path')
        doc.files['../escape.cpp'] = { structure: '', sections: [] };
      else doc.layout.nodes[0].periodMs = 999;
      fs.writeFileSync(manifest, JSON.stringify(doc));
    }
    const result = request({ op: 'import-project', path: manifest });
    assert.equal(result.ok, false, `${change} must be rejected`);
    assert.ok(result.error);
  }
});

test('unedited imported placeholders keep generating updated notes', () => {
  const { manifest } = exportedFixture();
  const imported = request({ op: 'import-project', path: manifest });
  assert.equal(imported.ok, true, imported.error);
  const p = imported.result.project;
  p.nodes[0].loop[0].note = 'Updated instruction after import';
  const preview = request({ op: 'preview', project: p }).result;
  assert.equal(preview.stepStates[p.nodes[0].loop[0].id], 'Empty');
  assert.match(
    preview.files['main/tasks/adc_task.cpp'],
    /TODO: Updated instruction after import/,
  );
});
test('local libraries export unchanged source, headers and dependencies only for assigned tasks', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'MSM_LiveData-'));
  fs.mkdirSync(path.join(dir, 'include'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(
    path.join(dir, 'include/MSM_LiveData.hpp'),
    '#pragma once\nnamespace MSM_LiveData { void publish(); }\n',
  );
  const implementation =
    '#include "MSM_LiveData.hpp"\nvoid MSM_LiveData::publish() {}\n';
  fs.writeFileSync(path.join(dir, 'src/MSM_LiveData.cpp'), implementation);
  const lib = request({ op: 'local-library', path: dir }).result.library;
  Object.assign(lib, {
    id: 'live-data',
    name: 'MSM_LiveData',
    headers: ['MSM_LiveData.hpp'],
    dependencies: ['freertos'],
  });
  const p = withoutCan(example());
  p.libraries = [lib];
  p.nodes[0].libraryIds = [lib.id];
  const result = request({ op: 'preview', project: p });
  assert.equal(result.ok, true, result.error);
  const files = result.result.files;
  assert.match(files['main/tasks/adc_task.cpp'], /#include "MSM_LiveData.hpp"/);
  assert.doesNotMatch(files['main/tasks/can_task.cpp'], /MSM_LiveData/);
  assert.equal(
    files['components/MSM_LiveData/src/MSM_LiveData.cpp'],
    implementation,
  );
  assert.match(
    files['components/MSM_LiveData/CMakeLists.txt'],
    /REQUIRES freertos/,
  );
  assert.match(files['main/CMakeLists.txt'], /PRIV_REQUIRES MSM_LiveData/);
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-lib-export-'));
  const output = request({ op: 'export', project: p, path: parent });
  assert.equal(output.ok, true, output.error);
  const imported = request({
    op: 'import-project',
    path: path.join(output.result.path, 'espresso.project.json'),
  });
  assert.equal(imported.ok, true, imported.error);
  assert.deepEqual(imported.result.project.libraries, [lib]);
  p.nodes[0].libraryIds = [];
  assert.equal(
    Object.keys(request({ op: 'preview', project: p }).result.files).some((f) =>
      f.startsWith('components/'),
    ),
    false,
  );
  p.nodes[0].libraryIds = ['missing'];
  assert.equal(request({ op: 'preview', project: p }).ok, false);
  lib.dependencies = ['x) injected('];
  assert.equal(request({ op: 'preview', project: p }).ok, false);
});

test(
  'generic GitHub libraries resolve a pinned release and survive project import',
  { skip: !process.env.ESPRESSO_LIVE_CAN },
  () => {
    const p = withoutCan(example());
    p.libraries = [
      {
        id: 'can-copy',
        name: 'MSM_CAN_Copy',
        source: 'github',
        repository: 'ManchesterStingerMotorsports/MSM_CAN',
        version: 'v1.0.0',
        headers: ['MSM_CAN.hpp'],
        dependencies: [
          'esp_driver_gpio',
          'esp_driver_twai',
          'esp_timer',
          'freertos',
        ],
      },
    ];
    p.nodes[0].libraryIds = ['can-copy'];
    const parent = fs.mkdtempSync(
      path.join(os.tmpdir(), 'espresso-github-lib-'),
    );
    const result = request({ op: 'export', project: p, path: parent });
    assert.equal(result.ok, true, result.error);
    const lock = JSON.parse(
      fs.readFileSync(
        path.join(result.result.path, 'espresso.libraries.lock.json'),
        'utf8',
      ),
    )['can-copy'];
    assert.equal(lock.release, 'v1.0.0');
    assert.match(lock.commit, /^[a-f0-9]{40}$/);
    assert.ok(
      fs.existsSync(
        path.join(
          result.result.path,
          'components/MSM_CAN_Copy/main/MSM_CAN.cpp',
        ),
      ),
    );
    const imported = request({
      op: 'import-project',
      path: path.join(result.result.path, 'espresso.project.json'),
    });
    assert.equal(imported.ok, true, imported.error);
    assert.deepEqual(imported.result.project.libraries, p.libraries);
  },
);
