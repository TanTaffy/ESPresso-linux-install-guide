import {
  cmakeExecutable,
  configureArgs,
  buildArgs,
} from '../scripts/cmake.mjs';
import { nativeExecutable, buildExecutable } from '../scripts/native-paths.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('exported firmware compiles and handles FIFO, full queues, events and notifications', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-firmware-'));
  const task = (id, name) => ({
    id,
    name,
    symbol: id,
    kind: 'task',
    position: { x: 0, y: 0 },
    periodMs: 10,
    priority: 2,
    stackBytes: 4096,
    core: 'any',
    setup: [],
    loop: [],
  });
  const producer = task('producer', 'Producer'),
    consumer = task('consumer', 'Consumer'),
    notification = task('notification', 'Notification'),
    multi = task('multi', 'Multi');
  multi.trigger = 'queues';
  multi.queueIds = ['messages', 'latest'];
  multi.loop = [
    { id: 'multi-event', kind: 'placeholder', name: 'Handle event', note: '' },
  ];
  producer.periodExpression = 'config::period';
  producer.parameters = [
    { name: 'value', label: 'Value', description: '', value: 'config::value' },
  ];
  consumer.trigger = 'queue';
  consumer.queueId = 'messages';
  notification.trigger = 'notification';
  producer.loop = [
    { id: 'populate', kind: 'placeholder', name: 'Populate', note: '' },
    {
      id: 'send',
      kind: 'send',
      name: 'Send',
      note: '',
      structId: 'messages',
      localName: 'packet',
      timeoutMs: 0,
      onFailure: 'return',
    },
    { id: 'sent', kind: 'placeholder', name: 'Count sent', note: '' },
    {
      id: 'notify',
      kind: 'notify',
      name: 'Notify',
      note: '',
      taskId: 'notification',
    },
  ];
  consumer.loop = [
    { id: 'consume', kind: 'placeholder', name: 'Consume', note: '' },
  ];
  notification.loop = [
    { id: 'notified', kind: 'placeholder', name: 'Notified', note: '' },
    {
      id: 'receive',
      kind: 'receive',
      name: 'Receive',
      note: '',
      structId: 'messages',
      localName: 'received',
      timeoutMs: 25,
      onFailure: 'return',
    },
    { id: 'remember', kind: 'placeholder', name: 'Remember sample', note: '' },
    {
      id: 'receive-next',
      kind: 'receive',
      name: 'Receive next',
      note: '',
      structId: 'messages',
      localName: 'message',
      timeoutMs: -1,
      onFailure: 'continue',
    },
    { id: 'add-next', kind: 'placeholder', name: 'Add next sample', note: '' },
  ];
  const key = (kind, id) => `${kind}-${Buffer.from(id).toString('hex')}`;
  const code = Object.fromEntries(
    ['producer', 'consumer', 'notification', 'multi'].map((id) => [
      key('includes', id),
      '#include "probe.hpp"\n',
    ]),
  );
  code[key('step', 'populate')] = '    packet.value = parameters::value;\n';
  code[key('step', 'sent')] = '    ++probe::sent;\n';
  code[key('step', 'consume')] = '    probe::received = event.value;\n';
  code[key('step', 'notified')] = '    ++probe::notifications;\n';
  code[key('step', 'remember')] = '    probe::received = received.value;\n';
  code[key('step', 'add-next')] = '    probe::received += message.value;\n';
  code[key('step', 'multi-event')] =
    `    if (const auto* message = std::get_if<messagesEvent>(&event)) {
        probe::events.push_back(message->value.value);
        if (message->value.value >= 10 && message->value.value < 12) {
            auto next = message->value; ++next.value;
            espresso::shared::send_messages(next, 0);
        }
    } else if (const auto* sample = std::get_if<latestEvent>(&event)) {
        probe::events.push_back(sample->value.sample.raw[0]);
    }
`;
  const project = {
    version: 1,
    name: 'firmware-check',
    target: 'esp32s3',
    libraries: [],
    configFile: {
      path: 'config/BoardConfig.hpp',
      content:
        '#pragma once\nnamespace config { inline constexpr int value = 41; inline constexpr int period = 10; }\n',
    },
    types: [
      {
        id: 'sample',
        name: 'SensorSample',
        kind: 'external',
        cppType: 'Sensor::Sample',
        headers: ['config/Sensor.hpp'],
        libraryIds: [],
        fields: [],
        values: [],
      },
      {
        id: 'state',
        name: 'State',
        kind: 'enum',
        cppType: '',
        headers: [],
        libraryIds: [],
        fields: [],
        values: [{ id: 'ready', name: 'Ready', value: '7' }],
      },
      {
        id: 'payload',
        name: 'Payload',
        kind: 'struct',
        cppType: '',
        headers: [],
        libraryIds: [],
        fields: [
          {
            id: 'raw',
            name: 'raw',
            type: 'uint16_t',
            arrayLength: 8,
            initialValue: '{}',
          },
          {
            id: 'sample',
            name: 'sample',
            type: 'type:sample',
            initialValue: '{}',
          },
          {
            id: 'state',
            name: 'state',
            type: 'type:state',
            initialValue: 'Ready',
          },
        ],
        values: [],
      },
    ],
    code,
    nodes: [
      producer,
      consumer,
      notification,
      multi,
      {
        id: 'unused',
        kind: 'struct',
        name: 'Unused queue',
        symbol: 'unused',
        typeName: 'Unused',
        position: { x: 0, y: 0 },
        delivery: 'queue',
        capacity: 3,
        fields: [
          {
            id: 'unused-value',
            name: 'value',
            type: 'uint8_t',
            initialValue: '0',
          },
        ],
      },
      {
        id: 'latest',
        kind: 'struct',
        name: 'Latest',
        symbol: 'latest',
        typeName: 'Latest',
        position: { x: 0, y: 0 },
        delivery: 'mailbox',
        payloadTypeId: 'payload',
        fields: [],
      },
      {
        id: 'messages',
        kind: 'struct',
        name: 'Messages',
        symbol: 'messages',
        typeName: 'Message',
        position: { x: 0, y: 0 },
        delivery: 'queue',
        capacity: 1,
        fields: [
          { id: 'value', name: 'value', type: 'int32_t', initialValue: '0' },
        ],
      },
    ],
  };
  project.extraFiles = {
    'main/config/Sensor.hpp': Buffer.from(
      '#pragma once\nnamespace Sensor { struct Sample { int raw[2] = {}; }; }\n',
    ).toString('base64'),
  };
  const result = JSON.parse(
    execFileSync(nativeExecutable(), [], {
      input: JSON.stringify({ op: 'export', project, path: root }),
      encoding: 'utf8',
      windowsHide: true,
    }),
  );
  assert.equal(result.ok, true, result.error);
  const runtimeFile = path.join(
    result.result.path,
    'main/config/BoardConfig.hpp',
  );
  fs.writeFileSync(
    runtimeFile,
    fs
      .readFileSync(runtimeFile, 'utf8')
      .replace('PERIOD_MS = config::period', 'PERIOD_MS = 25')
      .replace('STACK_BYTES = 4096', 'STACK_BYTES = 8192')
      .replace('PRIORITY = 2', 'PRIORITY = 5')
      .replace('CORE_AFFINITY = -1', 'CORE_AFFINITY = 0')
      .replace('CAPACITY = 3', 'CAPACITY = 7')
      .replace(
        'int LOOP_SEND_TIMEOUT_MS = 0',
        'unsigned LOOP_SEND_TIMEOUT_MS = 50',
      ),
  );
  const cmake = cmakeExecutable();
  const build = path.join(root, 'build');
  const run = (args) => {
    try {
      return execFileSync(cmake, args, { encoding: 'utf8', windowsHide: true });
    } catch (error) {
      throw new Error(`${error.message}\n${error.stdout}\n${error.stderr}`);
    }
  };
  run(configureArgs('tests/firmware', build, { FIRMWARE: result.result.path }));
  run(buildArgs(build));
  const output = execFileSync(buildExecutable(build, 'firmware-check'), [], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.match(output, /counting notifications passed/);
  // Real C++ compilation must reject unsafe library payloads, not just flag them in UI.
  fs.writeFileSync(
    path.join(result.result.path, 'main/config/Sensor.hpp'),
    '#pragma once\nnamespace Sensor { struct Sample { int raw[2] = {}; ~Sample() {} }; }\n',
  );
  assert.throws(
    () => run(buildArgs(build, ['--clean-first'])),
    /Payloads must be trivially copyable/,
  );
});
