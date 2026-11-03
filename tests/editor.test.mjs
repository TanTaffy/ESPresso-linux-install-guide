import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({
  entryPoints: ['src/editor/naming.ts', 'src/editor/placement.ts'],
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
const { codeSymbol, syncCodeNames, availableSymbol } = modules.find(
  (module) => module.codeSymbol,
);
const { freePosition } = modules.find((module) => module.freePosition);
const data = {
  kind: 'struct',
  id: 'pressure',
  name: 'Sensor output',
  symbol: 'sensor_output',
  typeName: 'SensorOutputSample',
  position: { x: 0, y: 0 },
  fields: [],
};

test('ordinary names generate legal identifiers including keywords, numbers and Windows reserved names', () => {
  for (const [name, expected] of [
    ['Pressure sample', 'pressure_sample'],
    ['123 °C', 'data_123_c'],
    ['class', 'data_class'],
    ['CO_AWAIT', 'data_co_await'],
    ['CON', 'data_con'],
    ['Event', 'data_event'],
    ['🫘', 'data_value'],
  ])
    assert.equal(codeSymbol(name), expected);
  assert.match(codeSymbol('x'.repeat(100)), /^[a-z][a-z0-9_]{0,47}$/);
  assert.equal(codeSymbol('a'.repeat(47) + ' value'), 'a'.repeat(47));
});

test('one data rename updates its generated type and connected local sample without changing custom labels', () => {
  const before = structuredClone(data),
    node = { ...data, name: 'Pressure' };
  const task = {
    kind: 'task',
    id: 'producer',
    symbol: 'producer',
    setup: [],
    loop: [
      {
        kind: 'send',
        structId: data.id,
        name: 'Send Sensor output',
        localName: data.symbol,
      },
      {
        kind: 'send',
        structId: data.id,
        name: 'Custom operation',
        localName: 'custom',
      },
    ],
  };
  const project = { nodes: [node, task] };
  syncCodeNames(project, before, node);
  assert.equal(node.symbol, 'pressure');
  assert.equal(node.typeName, 'PressureSample');
  assert.equal(task.loop[0].name, 'Send Pressure');
  assert.equal(task.loop[0].localName, 'pressure');
  assert.equal(task.loop[1].name, 'Custom operation');
  assert.equal(task.loop[1].localName, 'custom');
});

test('generated names resolve case-insensitive and payload-type collisions', () => {
  assert.equal(
    availableSymbol({ nodes: [{ ...data, symbol: 'Pressure' }] }, 'Pressure'),
    'pressure_2',
  );
  assert.equal(
    availableSymbol(
      { nodes: [], types: [{ name: 'PressureSample' }] },
      'Pressure',
    ),
    'pressure_2',
  );
});

test('custom, exported, imported and config-bound names stay stable', () => {
  for (const extra of [
    { codeNamesManual: true },
    { codeNamesLocked: true },
    { configNamespace: 'Config::sensor_output' },
    {},
  ]) {
    const node = { ...data, ...extra, name: 'Pressure' };
    const project = {
      nodes: [node],
      ...(!Object.keys(extra).length ? { imported: { nodes: [data] } } : {}),
    };
    syncCodeNames(project, data, node);
    assert.equal(node.symbol, data.symbol);
    assert.equal(node.typeName, data.typeName);
  }
});

test('task renames keep an automatically bound timing reference valid', () => {
  const before = {
    kind: 'task',
    id: 'task',
    name: 'Sensor',
    symbol: 'sensor',
    periodExpression: '1000 / (Config::sensor::RATE_HZ)',
    parameters: [],
  };
  const node = { ...before, name: 'Pressure sensor' };
  syncCodeNames({ nodes: [node] }, before, node);
  assert.equal(node.symbol, 'pressure_sensor');
  assert.equal(
    node.periodExpression,
    '1000 / (Config::pressure_sensor::RATE_HZ)',
  );
});

test('new node placement respects measured tall tasks and unmeasured nodes', () => {
  const nodes = [
    { ...data, id: 'tall' },
    { ...data, id: 'next', position: { x: 360, y: 0 } },
    { ...data, id: 'last', position: { x: 720, y: 0 } },
  ];
  const placed = freePosition(
    nodes,
    { tall: { width: 300, height: 1000 } },
    { x: 0, y: 0 },
  );
  assert.deepEqual(placed, { x: 360, y: 600 });
});
