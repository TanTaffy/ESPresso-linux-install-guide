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
const example = () =>
  request({
    op: 'load',
    path: path.resolve('examples/pressure-node.espresso.json'),
  }).result.project;
const withoutCan = (project) => {
  for (const node of project.nodes)
    if (node.kind === 'task') {
      node.libraryIds = [];
      if (node.symbol === 'can' && project.code) {
        delete project.code[`includes-${Buffer.from(node.id).toString('hex')}`];
        delete project.code[`loopvars-${Buffer.from(node.id).toString('hex')}`];
      }
    }
  return project;
};

const customType = (id, kind = 'struct') => ({
  id,
  name: id,
  kind,
  fields: [],
  values: [],
  cppType: '',
  headers: [],
  libraryIds: [],
});
test('arrays, nested structs, enums and library payloads generate in dependency order', () => {
  const p = withoutCan(example());
  p.types = [
    customType('Envelope'),
    customType('Status', 'enum'),
    customType('Sample', 'external'),
  ];
  p.types[0].fields = [
    {
      id: 'samples',
      name: 'samples',
      type: 'type:Sample',
      arrayLength: 8,
      initialValue: '{}',
    },
    { id: 'state', name: 'state', type: 'type:Status', initialValue: 'Ready' },
  ];
  p.types[1].values = [{ id: 'ready', name: 'Ready', value: '7' }];
  p.types[2].cppType = 'Sensor::Data';
  p.types[2].headers = ['Sensor.hpp'];
  p.types[2].libraryIds = ['sensor'];
  p.libraries = [
    {
      id: 'sensor',
      name: 'Sensor',
      source: 'local',
      version: 'local',
      headers: ['Sensor.hpp'],
      dependencies: [],
      files: {
        'Sensor.hpp':
          '#pragma once\nnamespace Sensor { struct Data { int raw[8]; }; }\n',
      },
    },
  ];
  p.nodes[1].payloadTypeId = 'Envelope';
  const r = request({ op: 'preview', project: p });
  assert.equal(r.result.valid, true, JSON.stringify(r));
  const f = r.result.files,
    types = f['main/generated/data_types.hpp'];
  assert.ok(types.indexOf('using Sample') < types.indexOf('struct Envelope'));
  assert.match(types, /samples\[8\] = \{\}/);
  assert.match(types, /::Status::Ready/);
  assert.match(
    f['main/shared/pressure.hpp'],
    /using PressureData = ::espresso::types::Envelope/,
  );
  assert.match(f['main/shared/pressure.hpp'], /is_trivially_copyable_v/);
  assert.match(f['main/generated/project.cmake'], /ESPRESSO_REQUIRES Sensor/);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-types-'));
  const exported = request({ op: 'export', project: p, path: root });
  assert.equal(exported.ok, true, exported.error);
  assert.ok(
    fs.existsSync(
      path.join(exported.result.path, 'components/Sensor/Sensor.hpp'),
    ),
  );
});
test('rich type validation rejects cycles, dangling types, unsafe paths and invalid arrays', () => {
  for (const mutate of [
    (p) => {
      p.nodes[1].fields[0].arrayLength = 0;
    },
    (p) => {
      p.nodes[1].fields[0].arrayLength = 4097;
    },
    (p) => {
      p.nodes[1].fields[0].type = 'type:missing';
    },
    (p) => {
      p.nodes[1].payloadTypeId = 'missing';
    },
    (p) => {
      p.types[0].fields = [
        { id: 'self', name: 'child', type: 'type:Payload', initialValue: '{}' },
      ];
    },
    (p) => {
      p.types[0].fields = [
        {
          id: 'array',
          name: 'raw',
          type: 'uint8_t',
          arrayLength: 3,
          initialValue: '5',
        },
      ];
    },
    (p) => {
      p.configFile = { path: '../escape.hpp', content: '' };
    },
    (p) => {
      p.configFile = { path: 'generated/data_types.hpp', content: '' };
    },
    (p) => {
      p.nodes[0].periodExpression = '10; do_stuff()';
    },
    (p) => {
      p.nodes[0].parameters = [
        { name: 'class', label: '', description: '', value: '4' },
      ];
    },
  ]) {
    const p = withoutCan(example());
    p.types = [customType('Payload')];
    mutate(p);
    const r = request({ op: 'preview', project: p });
    assert.ok(!r.ok || !r.result.valid, JSON.stringify(p));
  }
});
test('multi-input triggers validate their sources and signal only successful sends', () => {
  const p = queueProject();
  p.nodes[2].trigger = 'queues';
  p.nodes[2].queueIds = [p.nodes[1].id];
  p.nodes[1].delivery = 'mailbox';
  const r = request({ op: 'preview', project: p });
  assert.equal(r.result.valid, true, JSON.stringify(r));
  assert.match(r.result.files['main/shared/pressure.cpp'], /xQueueCreate\(1,/);
  assert.match(r.result.files['main/shared/pressure.cpp'], /xQueueOverwrite/);
  assert.match(
    r.result.files['main/shared/pressure.cpp'],
    /if \(sent\) ::espresso::generated::signal_pressure/,
  );
  assert.match(
    r.result.files['main/tasks/can_task.hpp'],
    /std::variant<pressureEvent>/,
  );
  assert.match(
    r.result.files['main/generated/task_runtime.cpp'],
    /xSemaphoreTake\(wake_can, portMAX_DELAY\)/,
  );
  for (const queueIds of [[], ['missing'], [p.nodes[1].id, p.nodes[1].id]]) {
    p.nodes[2].queueIds = queueIds;
    assert.equal(request({ op: 'preview', project: p }).result.valid, false);
  }
});

test('pressure example replaces unread samples and wakes CAN with the latest event', () => {
  const p = example(),
    r = request({ op: 'preview', project: p });
  assert.equal(r.ok, true);
  assert.equal(r.result.valid, true);
  assert.deepEqual(r.result.diagnostics, []);
  const f = r.result.files;
  assert.match(
    f['main/tasks/adc_task.cpp'],
    /using ::espresso::data::PressureData;/,
  );
  assert.match(f['main/tasks/adc_task.cpp'], /\]\] PressureData pressure\{\}/);
  assert.match(
    f['main/tasks/adc_task.cpp'],
    /\n    send_pressure\(pressure\);\n/,
  );
  assert.match(
    f['main/tasks/can_task.cpp'],
    /loop\(const PressureData& event\)/,
  );
  assert.match(f['main/config/Config.hpp'], /PERIOD_MS = 100/);
  assert.match(f['main/config/Config.hpp'], /namespace adc/);
  assert.doesNotMatch(f['main/config/Config.hpp'], /SAMPLE_RATE_HZ/);
  assert.equal(p.nodes[0].periodExpression, undefined);
  assert.match(f['main/generated/project_headers.hpp'], /config\/Config.hpp/);
  assert.match(
    f['main/tasks/adc_parameters.hpp'],
    /namespace parameters = ::Config::adc/,
  );
  assert.match(
    f['main/tasks/can_parameters.hpp'],
    /namespace parameters = ::Config::can/,
  );
  assert.match(
    f['main/shared/pressure.cpp'],
    /xQueueCreate\(1, sizeof\(data::PressureData\)\)/,
  );
  assert.equal(p.nodes[1].delivery, 'mailbox');
  assert.match(
    f['main/shared/pressure.cpp'],
    /xQueueOverwrite\(queue, &value\)/,
  );
  assert.doesNotMatch(f['main/tasks/can_task.cpp'], /receive_pressure\(/);
  assert.match(f['sdkconfig.defaults'], /CONFIG_FREERTOS_HZ=1000/);
  const { generatorCredit, ...layout } = JSON.parse(f['espresso.layout.json']);
  assert.match(
    generatorCredit,
    /James Platt for Manchester Stinger Motorsports$/,
  );
  assert.deepEqual(layout, p);
});
test('generation preserves ordering, notes, arbitrary structs and local aliases', () => {
  const p = example();
  const t = p.nodes[0];
  t.periodMs = 25;
  delete t.periodExpression;
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
  p2.delivery = 'snapshot';
  delete p2.capacity;
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
    code.indexOf('// TODO: First step') <
      code.indexOf('// TODO: Read pressure channel'),
  );
  assert.match(
    code,
    /\/\/ TODO: First step\n    \/\/ line one\n    \/\/ line two/,
  );
  assert.match(code, /TemperatureData temp\{\}/);
  assert.match(code, /send_pressure\(sample\)/);
  assert.match(r.result.files['main/config/Config.hpp'], /PERIOD_MS = 25/);
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
    delete q.nodes[0].periodExpression;
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

test('the shipped CAN definition is an ordinary editable template with an ordinary library', () => {
  const template = JSON.parse(
    fs.readFileSync('defaults/task-templates/can.espresso-task.json', 'utf8'),
  );
  const project = request({ op: 'new' }).result.project;
  const first = request({
    op: 'instantiate-template',
    project,
    template,
    position: { x: 120, y: 240 },
  });
  assert.equal(first.ok, true, first.error);
  const task = first.result.project.nodes.at(-1);
  assert.equal(task.preset, undefined);
  assert.equal(task.symbol, 'can');
  assert.deepEqual(task.position, { x: 120, y: 240 });
  assert.ok(task.setup.every((s) => !s.action));
  const second = request({
    op: 'instantiate-template',
    project: first.result.project,
    template,
    position: { x: 300, y: 240 },
  });
  assert.equal(second.result.project.nodes.at(-1).symbol, 'can_2');
  const p = first.result.project;
  const result = request({ op: 'preview', project: p }).result;
  assert.equal(result.valid, true);
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
  // The same library ID can be edited and the assignment can be removed.
  p.libraries[0] = {
    ...p.libraries[0],
    source: 'local',
    version: 'local',
    files: { 'MSM_CAN.hpp': '#pragma once\n' },
  };
  assert.equal(request({ op: 'preview', project: p }).result.valid, true);
  const overridden = request({
    op: 'instantiate-template',
    project: p,
    template,
    position: { x: 0, y: 0 },
  });
  assert.equal(overridden.ok, true, overridden.error);
  assert.equal(overridden.result.project.libraries[0].source, 'local');
  task.libraryIds = [];
  assert.equal(
    Object.keys(request({ op: 'preview', project: p }).result.files).some((f) =>
      f.startsWith('components/'),
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
        path.join(result.result.path, 'espresso.libraries.lock.json'),
        'utf8',
      ),
    );
    const resolved = lock['msm-can'];
    assert.ok(resolved.release);
    assert.ok(
      !Object.keys(resolved.sourcePaths).some((p) =>
        /(?:^|\/)example\.cpp$/.test(p),
      ),
    );
    assert.match(resolved.commit, /^[a-f0-9]{40}$/);
    const sourcePath = Object.keys(resolved.sourcePaths).find((p) =>
      p.endsWith('MSM_CAN.cpp'),
    );
    const response = await fetch(
      `https://raw.githubusercontent.com/ManchesterStingerMotorsports/MSM_CAN/${resolved.commit}/${sourcePath}`,
    );
    assert.equal(response.status, 200);
    assert.equal(
      fs.readFileSync(
        path.join(result.result.path, 'components/MSM_CAN/' + sourcePath),
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
function queueProject() {
  const p = withoutCan(example());
  const queue = p.nodes[1];
  queue.delivery = 'queue';
  queue.capacity = 3;
  p.nodes[0].loop.at(-1).kind = 'send';
  p.nodes[0].loop.at(-1).timeoutMs = 20;
  p.nodes[0].loop.at(-1).onFailure = 'return';
  p.nodes[2].loop = p.nodes[2].loop.filter((s) => s.kind !== 'read');
  p.nodes[2].trigger = 'queue';
  p.nodes[2].queueId = queue.id;
  return p;
}

test('send calls stay plain unless later operations or assertions need a failure check', () => {
  for (const phase of ['setup', 'loop'])
    for (const delivery of ['mailbox', 'queue'])
      for (const onFailure of ['return', 'continue', 'assert'])
        for (const followed of [false, true]) {
          const p = withoutCan(example());
          const adc = p.nodes[0];
          p.nodes[1].delivery = delivery;
          if (delivery === 'queue') p.nodes[1].capacity = 1;
          adc.setup = [];
          adc.loop = [];
          adc[phase] = [
            {
              id: 'send',
              kind: 'send',
              name: 'Send pressure',
              note: '',
              structId: 'struct-pressure',
              localName: 'pressure',
              timeoutMs: 0,
              onFailure,
            },
          ];
          if (followed)
            adc[phase].push({
              id: 'after',
              kind: 'placeholder',
              name: 'After send',
              note: '',
            });
          const result = request({ op: 'preview', project: p });
          assert.equal(result.result.valid, true, JSON.stringify(result));
          const source = result.result.files['main/tasks/adc_task.cpp'];
          const guarded =
            onFailure === 'assert' ||
            (delivery === 'queue' && onFailure === 'return' && followed);
          assert.equal(
            source.includes('if (!send_pressure(pressure))'),
            guarded,
            JSON.stringify({ phase, delivery, onFailure, followed }),
          );
          assert.equal(
            source.includes('\n    send_pressure(pressure);\n'),
            !guarded,
          );
          if (onFailure === 'assert')
            assert.match(source, /configASSERT\(false\)/);
          assert.doesNotMatch(
            source,
            /declared field defaults|USER IMPLEMENTATION|Timeout:|If sending fails/,
          );
          assert.ok(
            source.includes(
              delivery === 'mailbox'
                ? '// Publish pressure'
                : '// Send pressure to queue',
            ),
          );
        }
});

test('typed queues consume messages and queue-triggered loops receive the waking event', () => {
  const p = queueProject(),
    r = request({ op: 'preview', project: p });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.result.valid, true, JSON.stringify(r.result.diagnostics));
  const files = r.result.files;
  assert.match(
    files['main/shared/pressure.cpp'],
    /xQueueCreate\(::Config::queues::pressure::CAPACITY, sizeof\(data::PressureData\)\)/,
  );
  assert.match(
    files['main/shared/pressure.cpp'],
    /xQueueReceive\(queue, &value, timeout\)/,
  );
  assert.doesNotMatch(files['main/shared/pressure.cpp'], /Semaphore/);
  assert.match(
    files['main/tasks/adc_task.cpp'],
    /\n    send_pressure\(pressure\);\n/,
  );
  assert.match(
    files['main/tasks/can_task.hpp'],
    /using ::espresso::data::PressureData;[\s\S]*loop\(const PressureData& event\)/,
  );
  assert.match(
    files['main/generated/task_runtime.cpp'],
    /receive_pressure\(event, portMAX_DELAY\)/,
  );
  assert.match(files['main/generated/task_runtime.cpp'], /can::loop\(event\)/);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-queue-'));
  const exported = request({ op: 'export', project: p, path: out });
  assert.equal(exported.ok, true, exported.error);
  const imported = request({
    op: 'import-project',
    path: path.join(exported.result.path, 'espresso.project.json'),
  }).result.project;
  assert.equal(imported.nodes[1].capacity, p.nodes[1].capacity);
  assert.equal(imported.nodes[2].queueId, p.nodes[2].queueId);
  assert.equal(imported.nodes[2].trigger, 'queue');
  assert.deepEqual(
    imported.nodes.map((n) => n.id),
    p.nodes.map((n) => n.id),
  );
});

test('queue validation rejects incorrect access, invalid limits and dangling event references', () => {
  for (const mutate of [
    (p) => (p.nodes[1].capacity = 0),
    (p) => (p.nodes[1].capacity = 4097),
    (p) => (p.nodes[0].loop.at(-1).timeoutMs = -2),
    (p) => (p.nodes[0].loop.at(-1).kind = 'write'),
    (p) => (p.nodes[2].queueId = 'missing'),
    (p) => {
      p.nodes[0].trigger = 'queue';
      p.nodes[0].queueId = p.nodes[1].id;
      p.nodes[0].loop.at(-1).localName = 'event';
    },
  ]) {
    const p = queueProject();
    mutate(p);
    const result = request({ op: 'preview', project: p });
    assert.equal(result.result.valid, false, mutate.toString());
    assert.deepEqual(result.result.files, {});
  }
  const p = queueProject();
  p.nodes[2].loop.push({
    id: 'also-receive',
    kind: 'receive',
    name: 'Receive',
    note: '',
    structId: p.nodes[1].id,
    localName: 'extra',
    timeoutMs: -1,
    onFailure: 'continue',
  });
  const result = request({ op: 'preview', project: p }).result;
  assert.match(
    result.files['main/tasks/can_task.cpp'],
    /if \(const auto received = receive_pressure\(\)\)[\s\S]*extra = \*received;/,
  );
});

test('notifications have startup-safe handles and counting wakeups', () => {
  const p = withoutCan(example()),
    target = p.nodes[2];
  target.trigger = 'notification';
  p.nodes[0].setup.push({
    id: 'notify-at-start',
    kind: 'notify',
    name: 'Notify',
    note: '',
    taskId: target.id,
  });
  let r = request({ op: 'preview', project: p }).result;
  assert.equal(r.valid, true);
  assert.match(
    r.files['main/tasks/adc_task.cpp'],
    /using ::espresso::generated::notify_can;[\s\S]*    notify_can\(\)/,
  );
  const runtime = r.files['main/generated/task_runtime.cpp'];
  assert.match(runtime, /ulTaskNotifyTake\(pdFALSE, portMAX_DELAY\)/);
  assert.ok(
    runtime.indexOf('xEventGroupWaitBits') <
      runtime.indexOf('espresso::tasks::adc::setup'),
  );
  assert.ok(
    runtime.lastIndexOf('xTaskCreatePinnedToCore') <
      runtime.indexOf('xEventGroupSetBits'),
  );
  target.trigger = 'periodic';
  r = request({ op: 'preview', project: p }).result;
  assert.equal(r.valid, false);
});

test('user headers preserve their paths, unfamiliar code and external edits across import and re-export', () => {
  const p = withoutCan(example());
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-config-'));
  const out = request({ op: 'export', project: p, path: parent });
  assert.equal(out.ok, true, out.error);
  const header =
    request({ op: 'preview', project: p }).result.configContent +
    '#if CUSTOM_FEATURE\nstruct Extra { int value; };\n#endif\n';
  fs.writeFileSync(
    path.join(out.result.path, 'main/config/Config.hpp'),
    header,
  );
  const imported = request({
    op: 'import-project',
    path: path.join(out.result.path, 'espresso.project.json'),
  });
  assert.equal(imported.ok, true, imported.error);
  assert.equal(imported.result.project.configFile.content, header);
  const preview = request({
    op: 'preview',
    project: imported.result.project,
  }).result;
  assert.equal(preview.files['main/config/Config.hpp'], header);
  assert.match(
    preview.files['main/tasks/adc_task.cpp'],
    /#include "adc_parameters.hpp"/,
  );
});

test('custom task types persist and copy code and libraries with new stable IDs', () => {
  const p = withoutCan(example()),
    task = structuredClone(p.nodes[0]);
  task.loop = task.loop.filter((s) => s.kind === 'placeholder');
  const lib = {
    id: 'template-lib',
    name: 'TemplateLib',
    source: 'local',
    version: 'local',
    headers: ['TemplateLib.hpp'],
    dependencies: [],
    files: { 'TemplateLib.hpp': '#pragma once\n' },
  };
  task.libraryIds = [lib.id];
  task.parameters = [
    {
      name: 'sample_count',
      label: 'Sample count',
      description: 'Number of samples',
      value: '8',
    },
  ];
  const entry = {
    id: 'sensor-type',
    name: 'Sensor',
    description: 'Reads a sensor',
    icon: '📡',
    task,
    libraries: [lib],
    code: {
      [sectionKey('state', task.id)]: 'static int samples = 0;\n',
      [sectionKey('step', task.loop[0].id)]: '    ++samples;\n',
    },
  };
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-templates-'));
  assert.equal(
    request({ op: 'catalog-save', kind: 'templates', path: folder, entry }).ok,
    true,
  );
  assert.deepEqual(
    request({ op: 'catalog-load', kind: 'templates', path: folder }).result
      .items,
    [entry],
  );
  const first = request({
    op: 'instantiate-template',
    project: p,
    template: entry,
    position: { x: 250, y: 300 },
  });
  assert.equal(first.ok, true, first.error);
  const added = first.result.project.nodes.at(-1);
  assert.equal(added.name, 'Sensor');
  assert.deepEqual(added.parameters, task.parameters);
  assert.equal(added.description, entry.description);
  assert.equal(added.icon, entry.icon);
  assert.notEqual(added.id, task.id);
  assert.notEqual(added.loop[0].id, task.loop[0].id);
  assert.equal(added.symbol, 'adc_2');
  assert.deepEqual(added.position, { x: 250, y: 300 });
  const second = request({
    op: 'instantiate-template',
    project: first.result.project,
    template: entry,
    position: { x: 0, y: 0 },
  });
  assert.equal(second.ok, true, second.error);
  assert.equal(
    second.result.project.libraries.filter((l) => l.id === lib.id).length,
    1,
  );
  assert.equal(second.result.project.nodes.at(-1).symbol, 'adc_3');
  const preview = request({
    op: 'preview',
    project: second.result.project,
  }).result;
  assert.equal(preview.valid, true);
  assert.match(
    preview.files['main/tasks/adc_2_task.cpp'],
    /static int samples = 0/,
  );
  assert.match(preview.files['main/tasks/adc_3_task.cpp'], /\+\+samples/);
  assert.match(
    preview.files['main/config/Config.hpp'],
    /inline constexpr auto sample_count = 8/,
  );
  entry.code[sectionKey('step', task.loop[0].id)] = '    samples += 100;\n';
  assert.match(preview.files['main/tasks/adc_2_task.cpp'], /\+\+samples/);
  entry.task.symbol = '../escape';
  assert.equal(
    request({ op: 'catalog-save', kind: 'templates', path: folder, entry }).ok,
    false,
  );
  assert.equal(
    request({ op: 'catalog-load', kind: 'templates', path: folder }).result
      .items[0].task.symbol,
    'adc',
  );
});
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

test('folder catalogs load user files, isolate bad entries and keep deleted defaults deleted', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-catalog-'));
  const seed = () =>
    request({
      op: 'catalog-seed',
      path: folder,
      source: path.resolve('defaults/task-templates'),
    });
  assert.equal(seed().ok, true);
  const load = () =>
    request({ op: 'catalog-load', kind: 'templates', path: folder }).result;
  assert.deepEqual(
    load().items.map((t) => t.id),
    ['can'],
  );
  const custom = structuredClone(load().items[0]);
  custom.id = 'custom-file';
  custom.name = 'Custom file';
  fs.writeFileSync(path.join(folder, 'custom.json'), JSON.stringify(custom));
  fs.writeFileSync(path.join(folder, 'broken.json'), '{bad');
  let catalog = load();
  assert.equal(catalog.items.length, 2);
  assert.equal(catalog.errors.length, 1);
  assert.match(catalog.errors[0], /broken.json/);
  fs.writeFileSync(path.join(folder, 'duplicate.json'), JSON.stringify(custom));
  assert.equal(load().errors.length, 2);
  assert.equal(
    request({
      op: 'catalog-delete',
      kind: 'templates',
      path: folder,
      id: 'can',
    }).ok,
    true,
  );
  seed();
  assert.ok(!load().items.some((t) => t.id === 'can'));
  // Saving changes updates a single file, leaving hand-added files intact.
  custom.description = 'Edited';
  assert.equal(
    request({
      op: 'catalog-save',
      kind: 'templates',
      path: folder,
      entry: custom,
    }).ok,
    true,
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(folder, 'custom.json'), 'utf8'))
      .description,
    'Edited',
  );
  assert.ok(fs.existsSync(path.join(folder, 'broken.json')));
  const libraries = fs.mkdtempSync(
    path.join(os.tmpdir(), 'espresso-library-catalog-'),
  );
  request({
    op: 'catalog-seed',
    path: libraries,
    source: path.resolve('defaults/libraries'),
  });
  const lib = request({
    op: 'catalog-load',
    kind: 'libraries',
    path: libraries,
  }).result.items[0];
  lib.source = 'local';
  lib.files = { 'MSM_CAN.hpp': '#pragma once\n' };
  lib.version = 'local';
  assert.equal(
    request({
      op: 'catalog-save',
      kind: 'libraries',
      path: libraries,
      entry: lib,
    }).ok,
    true,
  );
});
test('project import preserves whole task files through config edits, save and repeated export', () => {
  const { project, folder, manifest } = exportedFixture();
  const file = 'main/tasks/adc_task.cpp';
  const original = fs.readFileSync(path.join(folder, file), 'utf8');
  assert.doesNotMatch(original, /espresso:(begin|end)/);
  const source =
    original.replace(
      '    // Read parameters::PRESSURE_CHANNEL into pressure.raw_count.',
      '    pressure.raw_count = 42;',
    ) + '\nnamespace custom { int samples = 3; }';
  fs.writeFileSync(path.join(folder, file), source);
  const imported = request({ op: 'import-project', path: manifest });
  assert.equal(imported.ok, true, imported.error);
  const p = imported.result.project;
  assert.equal(p.sourceFiles[file].content, source);
  p.nodes[0].name = 'Pressure sensor';
  p.nodes[0].periodMs = 25;
  const preview = request({ op: 'preview', project: p }).result;
  assert.equal(preview.valid, true);
  assert.equal(preview.files[file], source);
  const savePath = path.join(
    os.tmpdir(),
    `espresso-preserved-${Date.now()}.espresso.json`,
  );
  assert.equal(request({ op: 'save', project: p, path: savePath }).ok, true);
  const reopened = request({ op: 'load', path: savePath }).result.project;
  assert.equal(reopened.sourceFiles[file].content, source);
  const output = request({
    op: 'export',
    project: reopened,
    path: fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-reexport-')),
  });
  assert.equal(output.ok, true, output.error);
  const again = request({
    op: 'import-project',
    path: path.join(output.result.path, 'espresso.project.json'),
  });
  assert.equal(again.ok, true, again.error);
  assert.equal(again.result.project.sourceFiles[file].content, source);
  assert.equal(
    request({ op: 'preview', project: again.result.project }).result.files[
      file
    ],
    source,
  );
});

test('project import rejects missing files, unsafe inventories and inconsistent layout metadata', () => {
  for (const change of ['missing', 'path', 'layout']) {
    const { folder, manifest } = exportedFixture();
    if (change === 'missing')
      fs.unlinkSync(path.join(folder, 'main/tasks/adc_task.cpp'));
    if (change === 'path' || change === 'layout') {
      const doc = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (change === 'path') doc.files['../escape.cpp'] = { generated: '' };
      else doc.layout.nodes[0].symbol = 'missing_task';
      fs.writeFileSync(manifest, JSON.stringify(doc));
    }
    const result = request({ op: 'import-project', path: manifest });
    assert.equal(result.ok, false, `${change} must be rejected`);
    assert.ok(result.error);
  }
});

test('imported steps reject note edits before export', () => {
  const { folder, manifest } = exportedFixture();
  const original = fs.readFileSync(
    path.join(folder, 'main/tasks/adc_task.cpp'),
    'utf8',
  );
  const p = request({ op: 'import-project', path: manifest }).result.project;
  p.nodes[0].loop[0].note = 'Updated instruction after import';
  const preview = request({ op: 'preview', project: p }).result;
  assert.equal(preview.valid, false);
  assert.equal(p.sourceFiles['main/tasks/adc_task.cpp'].content, original);
  assert.ok(
    preview.diagnostics.some((d) => d.message.includes('Imported steps')),
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
  fs.writeFileSync(
    path.join(dir, 'src/example.cpp'),
    'extern "C" void app_main() {}\n',
  );
  const lib = request({ op: 'local-library', path: dir }).result.library;
  assert.equal(lib.files['src/example.cpp'], undefined);
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
  assert.match(
    files['main/generated/project.cmake'],
    /ESPRESSO_REQUIRES MSM_LiveData/,
  );
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
