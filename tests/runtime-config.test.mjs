import { nativeExecutable } from '../scripts/native-paths.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function request(value) {
  const r = JSON.parse(
    execFileSync(nativeExecutable(), [], {
      input: JSON.stringify(value),
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
  assert.equal(r.ok, true, r.error);
  return r.result;
}
function fixture() {
  return {
    version: 1,
    name: 'runtime-config',
    target: 'esp32s3',
    libraries: [],
    nodes: [
      {
        id: 'worker',
        kind: 'task',
        name: 'Worker',
        symbol: 'worker',
        position: { x: 0, y: 0 },
        periodMs: 100,
        priority: 2,
        stackBytes: 4096,
        core: 'any',
        setup: [],
        parameters: [],
        loop: [
          {
            id: 'send-reading',
            kind: 'send',
            name: 'Send reading',
            note: '',
            structId: 'readings',
            localName: 'reading',
            timeoutMs: 0,
            onFailure: 'continue',
          },
        ],
      },
      {
        id: 'readings',
        kind: 'struct',
        name: 'Readings',
        symbol: 'readings',
        typeName: 'Reading',
        position: { x: 0, y: 0 },
        delivery: 'queue',
        capacity: 8,
        fields: [
          { id: 'value', name: 'value', type: 'uint16_t', initialValue: '0' },
        ],
      },
    ],
  };
}
function importFile(p, content) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-runtime-')),
    file = path.join(root, 'Config.hpp');
  fs.writeFileSync(file, content);
  return request({ op: 'import-config', project: p, path: file }).project;
}

test('runtime settings, queue capacity and operation timeouts are read from config on project import', () => {
  const p = fixture(),
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-runtime-project-'));
  const first = request({ op: 'export', project: p, path: root }).path;
  const file = path.join(first, 'main/config/Config.hpp');
  const source = fs
    .readFileSync(file, 'utf8')
    .replace('PERIOD_MS = 100', 'PERIOD_MS = 25')
    .replace('PRIORITY = 2', 'PRIORITY = 5')
    .replace('STACK_BYTES = 4096', "STACK_BYTES = 8'192")
    .replace('CORE_AFFINITY = -1', 'CORE_AFFINITY = 1')
    .replace('CAPACITY = 8', 'CAPACITY = 16')
    .replace(
      'LOOP_SEND_READING_TIMEOUT_MS = 0',
      'LOOP_SEND_READING_TIMEOUT_MS = -1',
    );
  fs.writeFileSync(file, source);
  const imported = request({
    op: 'import-project',
    path: path.join(first, 'espresso.project.json'),
  }).project;
  const worker = imported.nodes[0],
    queue = imported.nodes[1];
  assert.deepEqual(
    [worker.periodMs, worker.priority, worker.stackBytes, worker.core],
    [25, 5, 8192, '1'],
  );
  assert.equal(worker.loop[0].timeoutMs, -1);
  assert.equal(queue.capacity, 16);
  assert.deepEqual(worker.parameters, []);
  const preview = request({ op: 'preview', project: imported });
  assert.equal(preview.valid, true);
  assert.equal(preview.configContent, source);
  assert.match(
    preview.files['main/generated/task_runtime.cpp'],
    /::Config::worker::PERIOD_MS/,
  );
  assert.match(
    preview.files['main/generated/task_runtime.cpp'],
    /::Config::worker::STACK_BYTES/,
  );
  assert.match(
    preview.files['main/shared/readings.cpp'],
    /queue = xQueueCreate\(::Config::queues::readings::CAPACITY,/,
  );
  assert.match(
    preview.files['main/tasks/worker_parameters.hpp'],
    /parameters::LOOP_SEND_READING_TIMEOUT_MS/,
  );
  worker.stackBytes = 12288;
  const changed = request({ op: 'preview', project: imported }).configContent;
  assert.equal(
    changed,
    source.replace("STACK_BYTES = 8'192", 'STACK_BYTES = 12288'),
  );
});

test('imported C++ expressions remain authoritative and keep matching controls bound to the config file', () => {
  const p = fixture();
  const source = request({ op: 'preview', project: p })
    .configContent.replace('PERIOD_MS = 100', "PERIOD_MS = 1'000 / 20")
    .replace('STACK_BYTES = 4096', 'STACK_BYTES = 2 * 4096')
    .replace('PRIORITY = 2', 'PRIORITY = (3)')
    .replace('CORE_AFFINITY = -1', 'CORE_AFFINITY = (0)')
    .replace('CAPACITY = 8', 'CAPACITY = (16)')
    .replace(
      'LOOP_SEND_READING_TIMEOUT_MS = 0',
      'LOOP_SEND_READING_TIMEOUT_MS = (50)',
    );
  const imported = importFile(p, source),
    worker = imported.nodes[0];
  assert.equal(worker.periodExpression, "1'000 / 20");
  assert.equal(worker.stackExpression, '2 * 4096');
  assert.equal(worker.priorityExpression, '(3)');
  assert.equal(worker.coreExpression, '(0)');
  assert.equal(worker.loop[0].timeoutExpression, '(50)');
  assert.equal(imported.nodes[1].capacityExpression, '(16)');
  assert.equal(
    request({ op: 'preview', project: imported }).configContent,
    source,
  );
});

test('out-of-range imported runtime values are diagnosed and preserved for correction', () => {
  for (const [from, to] of [
    ['PRIORITY = 2', 'PRIORITY = 0'],
    ['STACK_BYTES = 4096', 'STACK_BYTES = 1025'],
    ['CORE_AFFINITY = -1', 'CORE_AFFINITY = 4'],
    ['CAPACITY = 8', 'CAPACITY = 0'],
    ['LOOP_SEND_READING_TIMEOUT_MS = 0', 'LOOP_SEND_READING_TIMEOUT_MS = -2'],
  ]) {
    const p = fixture(),
      source = request({ op: 'preview', project: p }).configContent.replace(
        from,
        to,
      );
    const imported = importFile(p, source),
      preview = request({ op: 'preview', project: imported });
    assert.equal(preview.valid, false, to);
    assert.equal(imported.configFile.content, source);
  }
});

test('queue helpers hide config timeouts and retain names when imported tasks gain setup connectors', () => {
  const p = fixture();
  const worker = p.nodes[0];
  worker.loop.push(
    {
      id: 'receive-reading',
      kind: 'receive',
      name: 'Receive reading',
      note: '',
      structId: 'readings',
      localName: 'received',
      timeoutMs: 25,
      onFailure: 'return',
    },
    {
      id: 'receive-next',
      kind: 'receive',
      name: 'Receive next',
      note: '',
      structId: 'readings',
      localName: 'next',
      timeoutMs: -1,
      onFailure: 'continue',
    },
  );
  const preview = request({ op: 'preview', project: p });
  assert.equal(preview.valid, true);
  const source = preview.files['main/tasks/worker_task.cpp'];
  assert.match(source, /send_readings\(reading\)/);
  assert.match(source, /const auto received_message = receive_readings\(\)/);
  assert.match(source, /received = \*received_message/);
  assert.match(source, /receive_readings_2\(\)/);
  assert.doesNotMatch(
    source.replace(/\/\/[^\n]*/g, ''),
    /TIMEOUT_MS|pdMS_TO_TICKS|static_cast|static_assert/,
  );
  const header = preview.files['main/tasks/worker_parameters.hpp'];
  assert.match(
    header,
    /std::optional<::espresso::data::Reading> receive_readings\(\)/,
  );
  assert.match(header, /parameters::LOOP_RECEIVE_READING_TIMEOUT_MS/);
  assert.match(header, /parameters::LOOP_RECEIVE_NEXT_TIMEOUT_MS/);
  assert.match(header, /return std::nullopt/);
  const first = request({
    op: 'export',
    project: p,
    path: fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-queue-helpers-')),
  }).path;
  const imported = request({
    op: 'import-project',
    path: path.join(first, 'espresso.project.json'),
  }).project;
  imported.nodes[0].setup.push({
    id: 'send-startup',
    kind: 'send',
    name: 'Send startup',
    note: '',
    structId: 'readings',
    localName: 'startup',
    timeoutMs: 37,
    onFailure: 'return',
    requiresCode: true,
  });
  const updated = request({ op: 'preview', project: imported });
  assert.equal(updated.valid, true, JSON.stringify(updated.diagnostics));
  assert.equal(updated.files['main/tasks/worker_task.cpp'], source);
  assert.match(
    updated.files['main/tasks/worker_parameters.hpp'],
    /inline bool send_readings\([^]*?parameters::LOOP_SEND_READING_TIMEOUT_MS/,
  );
  assert.match(
    updated.files['main/tasks/worker_parameters.hpp'],
    /inline bool send_readings_2\([^]*?parameters::SETUP_SEND_STARTUP_TIMEOUT_MS/,
  );
  assert.match(
    updated.connectionCode['send-startup'],
    /send_readings_2\(startup\)/,
  );
  assert.doesNotMatch(
    updated.connectionCode['send-startup'],
    /pdMS_TO_TICKS|static_cast/,
  );
});
