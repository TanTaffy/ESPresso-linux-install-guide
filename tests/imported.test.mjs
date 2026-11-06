import {
  cmakeExecutable,
  configureArgs,
  buildArgs,
} from '../scripts/cmake.mjs';
import { nativeExecutable, buildExecutable } from '../scripts/native-paths.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const call = (value) =>
  JSON.parse(
    execFileSync(nativeExecutable(), [], {
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
    .replace('// TODO: Process\n    // Process sample', 'sample.value += 17;');
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

function placed(id, kind, data, localName, placement) {
  return {
    id,
    kind,
    name: id,
    note: '',
    structId: data,
    localName,
    placement,
    ...(['send', 'receive'].includes(kind)
      ? { timeoutMs: 25, onFailure: 'return' }
      : {}),
  };
}

test('imported send connectors use plain calls for mailboxes and final FIFO sends', () => {
  const { p: original } = fixture();
  for (const delivery of ['mailbox', 'queue'])
    for (const placement of ['start', 'end'])
      for (const onFailure of ['return', 'continue', 'assert'])
        for (const followed of [false, true]) {
          const p = structuredClone(original);
          p.nodes.push({
            id: 'messages',
            kind: 'struct',
            name: 'Messages',
            symbol: 'messages',
            typeName: 'Message',
            position: { x: 0, y: 0 },
            delivery,
            ...(delivery === 'queue' ? { capacity: 1 } : {}),
            fields: [
              {
                id: 'message-value',
                name: 'value',
                type: 'int32_t',
                initialValue: '0',
              },
            ],
          });
          p.nodes[0].loop.push({
            ...placed('output', 'send', 'messages', 'outgoing', placement),
            name: 'Send messages',
            onFailure,
          });
          if (followed)
            p.nodes[0].loop.push(
              placed('after-output', 'write', 'samples', 'after', 'end'),
            );
          const preview = request({ op: 'preview', project: p });
          assert.equal(
            preview.valid,
            true,
            JSON.stringify(preview.diagnostics),
          );
          const source = preview.files['main/tasks/adc_task.cpp'];
          const call =
            '::espresso::tasks::adc::connections::io_6f7574707574(outgoing)';
          const guarded =
            onFailure === 'assert' ||
            (delivery === 'queue' &&
              onFailure === 'return' &&
              (placement === 'start' || followed));
          assert.equal(
            source.includes('if (!' + call + ')'),
            guarded,
            JSON.stringify({ delivery, placement, onFailure, followed }),
          );
          assert.equal(source.includes('    ' + call + ';'), !guarded);
          assert.doesNotMatch(source, /GENERATED CONNECTOR\. Configure/);
          assert.ok(
            source.includes(
              delivery === 'mailbox'
                ? '// Publish messages'
                : '// Send messages to queue',
            ),
          );
        }
});

test('automatic connectors surround the preserved loop and survive repeated import without duplication', () => {
  let { p, code } = fixture();
  const originalBody = code.slice(
    code.indexOf('{', code.indexOf('void loop(')) + 1,
    code.lastIndexOf('}\n\n'),
  );
  p.nodes[0].loop.push(placed('new-read', 'read', 'samples', 'fresh', 'start'));
  p.nodes[0].loop.push(
    placed('new-write', 'write', 'samples', 'outgoing', 'end'),
  );
  const header = (p.sourceFiles['main/tasks/adc_task.hpp'].content +=
    '\n// My custom task declarations.\n');
  const parameterHeader = request({ op: 'preview', project: p }).files[
    'main/tasks/adc_parameters.hpp'
  ];
  p.sourceFiles['main/tasks/adc_parameters.hpp'] = {
    content: parameterHeader + '\n// My parameter helper.\n',
    generated: parameterHeader,
    taskId: 'adc',
  };
  let preview = request({ op: 'preview', project: p });
  assert.equal(preview.valid, true, JSON.stringify(preview.diagnostics));
  const extended = preview.files['main/tasks/adc_task.cpp'];
  assert.ok(extended.includes(originalBody));
  assert.ok(
    extended.indexOf('fresh = ::espresso::tasks::adc::connections::') <
      extended.indexOf('sample.value += 17;'),
  );
  assert.ok(
    extended.lastIndexOf('(outgoing);') >
      extended.indexOf('sample.value += 17;'),
  );
  assert.equal(preview.files['main/tasks/adc_task.hpp'], header);
  assert.ok(
    preview.files['main/tasks/adc_parameters.hpp'].endsWith(
      '// My parameter helper.\n',
    ),
  );
  assert.equal(preview.files['connection-updates.md'], undefined);
  assert.equal(p.sourceFiles['main/tasks/adc_task.cpp'].content, code);
  assert.equal(
    request({ op: 'preview', project: p }).files['main/tasks/adc_task.cpp'],
    extended,
  );
  for (let i = 0; i < 2; ++i) {
    const folder = request({
      op: 'export',
      project: p,
      path: fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-placed-')),
    }).path;
    p = request({ op: 'import-project', path: folder }).project;
    preview = request({ op: 'preview', project: p });
    assert.equal(preview.valid, true, JSON.stringify(preview.diagnostics));
    assert.equal(preview.files['main/tasks/adc_task.cpp'], extended);
    assert.ok(preview.files['main/generated/adc_connections.hpp']);
  }
  // Additional connectors can still be added after previous additions become preserved code.
  p.nodes[0].loop.push(
    placed('another-read', 'read', 'samples', 'another', 'start'),
  );
  preview = request({ op: 'preview', project: p });
  assert.equal(preview.valid, true, JSON.stringify(preview.diagnostics));
  assert.equal(
    preview.files['main/tasks/adc_task.cpp'].split(
      'fresh = ::espresso::tasks::adc::connections::',
    ).length - 1,
    1,
  );
});

test('automatic connector placement respects C++ literals, nested namespaces, BOMs and CRLF', () => {
  for (const nested of [false, true]) {
    const { p } = fixture();
    let source = p.sourceFiles['main/tasks/adc_task.cpp'].content;
    source = source.replace(
      'sample.value += 17;',
      "[[maybe_unused]] const char* text = u8R\"tag(} fake void loop() { //)tag\";\n    [[maybe_unused]] const char brace = '}';\n    [[maybe_unused]] const int n = 1'000;\n    /* } } */ sample.value += 17;",
    );
    if (nested)
      source =
        source.replace(
          'namespace espresso::tasks::adc {',
          'namespace espresso { namespace tasks { namespace adc {',
        ) + '\n} }\n';
    source = source.replace(
      'sample.value += 17;',
      '#if defined(HARDWARE_VARIANT)\n    { sample.value += 17; }\n#else\n    sample.value += 17;\n#endif',
    );
    source = '\uFEFF' + source.replaceAll('\n', '\r\n');
    p.sourceFiles['main/tasks/adc_task.cpp'].content = source;
    p.nodes[0].loop.push(
      placed('read-new', 'read', 'samples', 'fresh', 'start'),
    );
    const preview = request({ op: 'preview', project: p });
    assert.equal(preview.valid, true, JSON.stringify(preview.diagnostics));
    const output = preview.files['main/tasks/adc_task.cpp'];
    assert.ok(output.startsWith('\uFEFF'));
    assert.ok(output.includes('u8R"tag(} fake void loop() { //)tag"'));
    assert.equal(output.replaceAll('\r\n', '').includes('\n'), false);
    assert.equal(p.sourceFiles['main/tasks/adc_task.cpp'].content, source);
  }
});

test('ambiguous loops and colliding names block export without changing imported source', () => {
  const { p } = fixture();
  p.nodes[0].loop.push(placed('read-new', 'read', 'samples', 'fresh', 'start'));
  for (const mutate of [
    (source) => source.replace('void loop()', 'void another_loop()'),
    (source) =>
      source + '\nnamespace espresso::tasks::adc { void loop() {} }\n',
    (source) =>
      source.replace('void loop()', '#if HARDWARE_VARIANT\nvoid loop()') +
      '\n#endif\n',
    (source) =>
      source.replace(
        'sample.value += 17;',
        'const int fresh = 7; sample.value += fresh;',
      ),
  ]) {
    const changed = structuredClone(p);
    const source = mutate(
      changed.sourceFiles['main/tasks/adc_task.cpp'].content,
    );
    changed.sourceFiles['main/tasks/adc_task.cpp'].content = source;
    const preview = request({ op: 'preview', project: changed });
    assert.equal(preview.valid, false);
    assert.ok(preview.diagnostics.some((d) => d.severity === 'error'));
    assert.equal(
      changed.sourceFiles['main/tasks/adc_task.cpp'].content,
      source,
    );
  }
});

test('new library assignments add headers and build registration while preserving customised libraries', () => {
  const { p } = fixture();
  const original = p.sourceFiles['main/tasks/adc_task.cpp'].content;
  p.extraFiles['components/Sensor/Sensor.hpp'] = Buffer.from(
    '#pragma once\n// My patched sensor library.\n',
  ).toString('base64');
  p.libraries.push({
    id: 'new-lib',
    name: 'NewLibrary',
    source: 'local',
    version: 'local',
    headers: ['NewLibrary.hpp'],
    dependencies: ['freertos'],
    files: {
      'NewLibrary.hpp':
        '#pragma once\nnamespace extra { inline int value() { return 9; } }\n',
    },
  });
  p.nodes[0].libraryIds.push('new-lib');
  const preview = request({ op: 'preview', project: p });
  assert.equal(preview.valid, true, JSON.stringify(preview.diagnostics));
  assert.ok(
    preview.files['main/tasks/adc_task.cpp'].includes(
      '#include "NewLibrary.hpp"',
    ),
  );
  assert.ok(
    preview.files['main/generated/project.cmake'].includes('NewLibrary'),
  );
  assert.ok(
    preview.files['components/NewLibrary/CMakeLists.txt'].includes(
      'REQUIRES freertos',
    ),
  );
  assert.equal(
    preview.files['components/Sensor/Sensor.hpp'],
    '#pragma once\n// My patched sensor library.\n',
  );
  assert.equal(p.sourceFiles['main/tasks/adc_task.cpp'].content, original);
});

test('importing a final FIFO send restores its guard when a later connector is added', () => {
  for (const newline of ['\n', '\r\n']) {
    const { p } = fixture();
    delete p.sourceFiles;
    delete p.imported;
    p.nodes.push({
      id: 'messages',
      kind: 'struct',
      name: 'Messages',
      symbol: 'messages',
      typeName: 'Message',
      position: { x: 0, y: 0 },
      delivery: 'queue',
      capacity: 1,
      fields: [
        {
          id: 'message-value',
          name: 'value',
          type: 'int32_t',
          initialValue: '0',
        },
      ],
    });
    p.nodes[0].loop.push({
      id: 'tail-output',
      kind: 'send',
      name: 'Send messages',
      note: '',
      structId: 'messages',
      localName: 'outgoing',
      timeoutMs: 0,
      onFailure: 'return',
    });
    const helperKey = `helpers-${Buffer.from('adc').toString('hex')}`;
    const handwritten =
      'const char* marker = R"doc(send_messages(outgoing);)doc";\n';
    p.code = { ...p.code, [helperKey]: handwritten };
    const folder = request({
      op: 'export',
      project: p,
      path: fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-tail-send-')),
    }).path;
    const sourcePath = path.join(folder, 'main/tasks/adc_task.cpp');
    const original = fs
      .readFileSync(sourcePath, 'utf8')
      .replace(/\n/g, newline);
    fs.writeFileSync(sourcePath, original);
    assert.ok(original.includes('    send_messages(outgoing);'));
    const imported = request({ op: 'import-project', path: folder }).project;
    imported.nodes[0].loop.push(
      placed('following-write', 'write', 'samples', 'following', 'end'),
    );
    const source = request({ op: 'preview', project: imported }).files[
      'main/tasks/adc_task.cpp'
    ];
    assert.ok(source.includes('    if (!send_messages(outgoing)) return;'));
    assert.ok(source.includes(handwritten.replace(/\n/g, newline)));
    assert.equal(
      imported.sourceFiles['main/tasks/adc_task.cpp'].content,
      original,
    );
    assert.equal(
      (source.match(/if \(!send_messages\(outgoing\)\) return;/g) ?? []).length,
      1,
    );
    assert.equal(
      source,
      request({ op: 'preview', project: imported }).files[
        'main/tasks/adc_task.cpp'
      ],
    );
  }
});

test('extended imported C++ compiles and executes input/output, notification, timeout and early-return behaviour', () => {
  const { p } = fixture();
  p.libraries.push({
    id: 'extra-lib',
    name: 'NewLibrary',
    source: 'local',
    version: 'local',
    headers: ['NewLibrary.hpp'],
    dependencies: [],
    files: {
      'NewLibrary.hpp':
        '#pragma once\nnamespace extra { inline int value() { return 9; } }\n',
    },
  });
  p.nodes[0].libraryIds.push('extra-lib');
  p.sourceFiles['main/tasks/adc_task.cpp'].content = p.sourceFiles[
    'main/tasks/adc_task.cpp'
  ].content
    .replace(
      'namespace espresso::tasks::adc {',
      '/* Keep this multiline comment\n   intact. */ int library_probe() { return extra::value(); }\n\nnamespace espresso::tasks::adc {',
    )
    .replace(
      'sample.value += 17;',
      'sample.value += 17;\n    if (sample.value < 0) return;',
    );
  p.nodes.push({
    id: 'messages',
    kind: 'struct',
    name: 'Messages',
    symbol: 'messages',
    typeName: 'Message',
    position: { x: 0, y: 0 },
    delivery: 'queue',
    capacity: 8,
    fields: [
      {
        id: 'message-value',
        name: 'value',
        type: 'int32_t',
        initialValue: '0',
      },
    ],
  });
  const logger = task('logger');
  logger.libraryIds = [];
  logger.parameters = [];
  logger.loop = [];
  logger.trigger = 'notification';
  p.nodes.push(logger);
  p.nodes[0].loop.push(
    placed('queue-input', 'receive', 'messages', 'fresh', 'start'),
  );
  p.nodes[0].loop.push({
    ...placed('queue-output', 'send', 'messages', 'fresh', 'end'),
    timeoutMs: 50,
  });
  const notification = {
    id: 'notify-added',
    kind: 'notify',
    name: 'Notify logger',
    note: '',
    taskId: 'logger',
    placement: 'end',
  };
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'espresso-imported-runtime-'),
  );
  let output = request({ op: 'export', project: p, path: root }).path;
  const cmake = cmakeExecutable();
  const run = (args) => {
    try {
      return execFileSync(cmake, args, { encoding: 'utf8', windowsHide: true });
    } catch (error) {
      throw new Error(`${error.message}\n${error.stdout}\n${error.stderr}`);
    }
  };
  for (const tail of [true, false]) {
    // Compile each scenario independently. Rapidly changing TAIL_SEND in one
    // Makefiles build can reuse a stale object on coarse-timestamp filesystems.
    const build = path.join(root, tail ? 'build-tail' : 'build-followed');
    if (!tail) {
      const imported = request({ op: 'import-project', path: output }).project;
      imported.nodes[0].loop.push(notification);
      const original = fs.readFileSync(
        path.join(output, 'main/tasks/adc_task.cpp'),
        'utf8',
      );
      const call =
        '::espresso::tasks::adc::connections::io_71756575652d6f7574707574(fresh)';
      assert.ok(original.includes('    ' + call + ';'));
      output = request({
        op: 'export',
        project: imported,
        path: fs.mkdtempSync(
          path.join(os.tmpdir(), 'espresso-imported-followup-'),
        ),
      }).path;
      const extended = fs.readFileSync(
        path.join(output, 'main/tasks/adc_task.cpp'),
        'utf8',
      );
      assert.ok(extended.includes('if (!' + call + ') return;'));
    }
    run(
      configureArgs('tests/imported-firmware', build, {
        FIRMWARE: output,
        TAIL_SEND: tail ? 'ON' : 'OFF',
      }),
    );
    run(buildArgs(build));
    const result = execFileSync(buildExecutable(build, 'imported-check'), [], {
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.match(
      result,
      /Imported connectors, payloads, timeouts and early returns passed/,
    );
  }
  const imported = request({ op: 'import-project', path: output }).project;
  const next = request({
    op: 'export',
    project: imported,
    path: fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-runtime-again-')),
  }).path;
  assert.equal(
    fs.readFileSync(path.join(next, 'main/tasks/adc_task.cpp'), 'utf8'),
    fs.readFileSync(path.join(output, 'main/tasks/adc_task.cpp'), 'utf8'),
  );
});
