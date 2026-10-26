import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const request = (value) => {
  const response = JSON.parse(
    execFileSync('build/native/Release/espresso-core.exe', [], {
      input: JSON.stringify(value),
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 24 * 1024 * 1024,
    }),
  );
  assert.equal(response.ok, true, response.error);
  return response.result;
};
const task = (symbol) => ({
  id: symbol,
  name: symbol.toUpperCase(),
  symbol,
  kind: 'task',
  position: { x: 0, y: 0 },
  periodMs: 100,
  priority: 2,
  stackBytes: 4096,
  core: 'any',
  configNamespace: `Config::${symbol}`,
  parameters: [],
  setup: [],
  loop: [
    { id: `${symbol}-sample`, kind: 'placeholder', name: 'Sample', note: '' },
  ],
});
const project = () => ({
  version: 1,
  name: 'roundtrip-node',
  target: 'esp32s3',
  nodes: [task('adc')],
  libraries: [],
});
const exportTo = (p) =>
  request({
    op: 'export',
    project: p,
    path: fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-roundtrip-')),
  }).path;

test('new CAN settings inherit the pressure example indentation without adding blank lines', () => {
  const p = JSON.parse(
    fs.readFileSync('examples/pressure-node.espresso.json', 'utf8'),
  );
  const can = p.nodes.find((n) => n.symbol === 'can');
  const before = request({ op: 'preview', project: p }).configContent;
  can.parameters.push({
    name: 'testval',
    type: 'testType_t',
    value: '3',
    label: '',
    description: '',
  });
  const expected = before.replace(
    '        inline constexpr gpio_num_t TX_GPIO = GPIO_NUM_1;\n',
    '        inline constexpr gpio_num_t TX_GPIO = GPIO_NUM_1;\n        inline constexpr testType_t testval = 3;\n',
  );
  const preview = request({ op: 'preview', project: p });
  assert.equal(preview.valid, true);
  assert.equal(preview.configContent, expected);
  assert.equal(preview.files['main/config/Config.hpp'], expected);
});

test('setting insertion preserves two-space indentation, tabs, empty namespaces and CRLF', () => {
  for (const [indent, ending, existing] of [
    ['  ', '\n', true],
    ['\t', '\r\n', true],
    ['  ', '\r\n', false],
    ['\t', '\n', false],
  ]) {
    const p = project();
    const lines = [
      '#pragma once',
      'namespace Config',
      '{',
      `${indent}namespace adc`,
      `${indent}{`,
      ...(existing
        ? [`${indent}${indent}inline constexpr int PIN = 11; // keep me`]
        : []),
      `${indent}}`,
      '}',
      '',
    ];
    let source = lines.join(ending);
    p.configFile = { path: 'config/Config.hpp', content: source };
    p.nodes[0].configKeys = existing ? ['PIN'] : [];
    p.nodes[0].parameters = existing
      ? [{ name: 'PIN', type: 'int', value: '11', label: '', description: '' }]
      : [];
    source = request({ op: 'preview', project: p }).configContent;
    p.configFile.content = source;
    p.nodes[0].configKeys.push(
      'PERIOD_MS',
      'PRIORITY',
      'STACK_BYTES',
      'CORE_AFFINITY',
    );
    p.nodes[0].parameters.push({
      name: 'RATE',
      type: 'int',
      value: '3',
      label: '',
      description: 'First line\nSecond line',
    });
    const expected = source.replace(
      `${indent}}${ending}`,
      `${indent}${indent}// First line${ending}${indent}${indent}// Second line${ending}${indent}${indent}inline constexpr int RATE = 3;${ending}${indent}}${ending}`,
    );
    assert.equal(
      request({ op: 'preview', project: p }).configContent,
      expected,
    );
    const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'espresso-indent-'),
      ),
      file = path.join(directory, 'Config.hpp');
    fs.writeFileSync(file, expected);
    const imported = request({
      op: 'import-config',
      project: p,
      path: file,
    }).project;
    assert.equal(
      request({ op: 'preview', project: imported }).configContent,
      expected,
    );
  }
});

test('inline namespaces get valid line breaks and fresh namespaces use a single blank separator', () => {
  const p = project();
  p.configFile = {
    path: 'config/Config.hpp',
    content:
      '#pragma once\nnamespace Config::adc { inline constexpr int PIN = 11; }\n',
  };
  p.nodes[0].configKeys = ['PIN'];
  p.nodes[0].parameters = [
    { name: 'PIN', type: 'int', value: '11', label: '', description: '' },
    { name: 'RATE', type: 'int', value: '3', label: '', description: '' },
  ];
  const rendered = request({ op: 'preview', project: p }).configContent;
  assert.match(
    rendered,
    /PIN = 11; \n    inline constexpr int RATE = 3;\n    inline constexpr unsigned PERIOD_MS = 100;/,
  );
  const fresh = project();
  fresh.nodes.push(task('gps'));
  const freshConfig = request({ op: 'preview', project: fresh }).configContent;
  assert.ok(
    freshConfig.startsWith(
      '#pragma once\n#include <cstdint>\n\nnamespace Config::adc\n{\n',
    ),
  );
  assert.match(freshConfig, /}\n\nnamespace Config::gps\n{/);
  assert.doesNotMatch(freshConfig, /\n\n\n/);
});

test('export, implement, import, add GPS and re-export retains config, code, build customisations and binary files', () => {
  const first = exportTo(project());
  const configPath = path.join(first, 'main/config/Config.hpp');
  assert.match(fs.readFileSync(configPath, 'utf8'), /namespace Config::adc/);
  const handwritten =
    '#pragma once\r\n#include <cstdint>\r\nnamespace Config {\r\nnamespace adc {\r\n    // Board wiring and clock chosen during implementation.\r\n    static constexpr uint32_t SPI_CLOCK_HZ = 4\'000\'000; // retain this comment\r\n    inline constexpr int pins[2] = {11, 12};\r\n    struct Extra { const char* text = R"tag(} ; // namespace fake {)tag"; };\r\n}\r\n}\r\nnamespace Shared { inline constexpr int BUFFER_LEN = 8; }\r\n';
  fs.writeFileSync(configPath, handwritten);
  const adcPath = path.join(first, 'main/tasks/adc_task.cpp');
  let adcSource = fs.readFileSync(adcPath, 'utf8');
  const key = `step-${Buffer.from('adc-sample').toString('hex')}`;
  adcSource = adcSource.replace(
    new RegExp(
      `(// espresso:begin ${key}\\n)[\\s\\S]*?(?= *// espresso:end ${key})`,
    ),
    '$1    const int sample = 17;\n    (void)sample;\n',
  );
  adcSource +=
    '\nnamespace driver_helpers { int unchanged() { return 99; } }\n';
  fs.writeFileSync(adcPath, adcSource);
  const adcHeaderPath = path.join(first, 'main/tasks/adc_task.hpp');
  const adcHeader =
    fs.readFileSync(adcHeaderPath, 'utf8') +
    '\nnamespace driver_helpers { inline constexpr int CHANNEL = 3; }\n';
  fs.writeFileSync(adcHeaderPath, adcHeader);
  fs.mkdirSync(path.join(first, 'main/drivers'));
  const extra = {
    'main/drivers/Spi.cpp': Buffer.from(
      '#include "Spi.hpp"\nint read_spi() { return 17; }\n',
    ),
    'main/drivers/Spi.hpp': Buffer.from('#pragma once\nint read_spi();\n'),
    'calibration table.bin': Buffer.from([0, 255, 254, 128, 13, 10, 0]),
    'README.md': Buffer.from('My firmware development notes.\n'),
    sdkconfig: Buffer.from('CONFIG_MY_BOARD=y\n'),
  };
  for (const [file, bytes] of Object.entries(extra))
    fs.writeFileSync(path.join(first, file), bytes);
  const build =
    fs
      .readFileSync(path.join(first, 'main/CMakeLists.txt'), 'utf8')
      .replace(
        '\n)\n# espresso:end sources',
        '\n    "drivers/Spi.cpp"\n)\n# espresso:end sources',
      )
      .replace(
        '# espresso:begin libraries\n',
        '# espresso:begin libraries\n    PRIV_REQUIRES esp_driver_spi\n',
      ) +
    '\ntarget_compile_definitions(${COMPONENT_LIB} PRIVATE CUSTOM_BOARD=1)\n';
  fs.writeFileSync(
    path.join(first, 'main/CMakeLists.txt'),
    build.replaceAll('\n', '\r\n'),
  );
  fs.appendFileSync(
    path.join(first, 'CMakeLists.txt'),
    '\n# My custom root build notes\n',
  );
  fs.mkdirSync(path.join(first, 'build'));
  fs.writeFileSync(path.join(first, 'build/ignored.bin'), Buffer.from([1]));
  const imported = request({
    op: 'import-project',
    path: path.join(first, 'espresso.project.json'),
  }).project;
  assert.equal(imported.configFile.content, handwritten);
  assert.deepEqual(
    imported.nodes[0].parameters.map((p) => [p.name, p.type, p.value]),
    [['SPI_CLOCK_HZ', 'uint32_t', "4'000'000"]],
  );
  assert.equal(imported.extraFiles['build/ignored.bin'], undefined);
  imported.nodes[0].parameters[0].value = "2'000'000";
  const gps = task('gps');
  gps.parameters.push({
    name: 'BAUD_RATE',
    type: 'uint32_t',
    label: 'GPS baud rate',
    description: '',
    value: "9'600",
  });
  imported.nodes.push(gps);
  imported.libraries.push({
    id: 'gps-lib',
    name: 'GPSLib',
    source: 'local',
    version: 'local',
    headers: ['GPS.hpp'],
    dependencies: [],
    files: { 'GPS.hpp': '#pragma once\n' },
  });
  gps.libraryIds = ['gps-lib'];
  const layout = path.join(
    os.tmpdir(),
    `espresso-roundtrip-${Date.now()}.espresso.json`,
  );
  request({ op: 'save', project: imported, path: layout });
  const reopened = request({ op: 'load', path: layout }).project;
  const second = exportTo(reopened);
  const config = fs.readFileSync(
    path.join(second, 'main/config/Config.hpp'),
    'utf8',
  );
  assert.ok(
    config
      .replace(
        /^[ \t]*inline constexpr (?:unsigned|int) (?:PERIOD_MS|PRIORITY|STACK_BYTES|CORE_AFFINITY) = [^;]+;\r?\n/gm,
        '',
      )
      .startsWith(
        handwritten.replace(
          "SPI_CLOCK_HZ = 4'000'000",
          "SPI_CLOCK_HZ = 2'000'000",
        ),
      ),
  );
  assert.match(config, /namespace Config::gps[\s\S]*BAUD_RATE = 9'600/);
  assert.equal(
    fs.readFileSync(path.join(second, 'main/tasks/adc_task.cpp'), 'utf8'),
    adcSource,
  );
  assert.equal(
    fs.readFileSync(path.join(second, 'main/tasks/adc_task.hpp'), 'utf8'),
    adcHeader,
  );
  assert.match(
    fs.readFileSync(path.join(second, 'main/CMakeLists.txt'), 'utf8'),
    /gps_task.cpp/,
  );
  assert.match(
    fs.readFileSync(path.join(second, 'main/CMakeLists.txt'), 'utf8'),
    /CUSTOM_BOARD=1/,
  );
  assert.match(
    fs.readFileSync(path.join(second, 'main/CMakeLists.txt'), 'utf8'),
    /PRIV_REQUIRES GPSLib esp_driver_spi/,
  );
  assert.match(
    fs.readFileSync(path.join(second, 'main/CMakeLists.txt'), 'utf8'),
    /"drivers\/Spi.cpp"/,
  );
  assert.match(
    fs.readFileSync(path.join(second, 'CMakeLists.txt'), 'utf8'),
    /My custom root build notes/,
  );
  for (const [file, bytes] of Object.entries(extra))
    assert.deepEqual(fs.readFileSync(path.join(second, file)), bytes, file);
  const again = request({
    op: 'import-project',
    path: path.join(second, 'espresso.project.json'),
  }).project;
  assert.equal(
    again.nodes.find((n) => n.symbol === 'gps').parameters[0].value,
    "9'600",
  );
  assert.equal(again.nodes[0].parameters[0].value, "2'000'000");
  assert.equal(request({ op: 'preview', project: again }).valid, true);
});

test('settings can be created, changed and removed on an ordinary task while opaque C++ stays intact', () => {
  const p = project();
  p.nodes[0].parameters = [
    { name: 'PIN', type: 'int', value: '11', label: '', description: '' },
  ];
  let preview = request({ op: 'preview', project: p });
  assert.match(preview.configContent, /inline constexpr int PIN = 11/);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-config-'));
  const file = path.join(root, 'Config.hpp');
  const source =
    preview.configContent.replace('PIN = 11', 'PIN = 12') +
    '\n#if CUSTOM_FEATURE\nnamespace Config::adc { constexpr int CONDITIONAL = 7; }\n#endif\n';
  fs.writeFileSync(file, source);
  const imported = request({
    op: 'import-config',
    project: p,
    path: file,
  }).project;
  assert.equal(imported.nodes[0].parameters[0].value, '12');
  assert.equal(imported.nodes[0].parameters.length, 1);
  assert.equal(
    request({ op: 'preview', project: imported }).configContent,
    source,
  );
  imported.nodes[0].parameters = [];
  preview = request({ op: 'preview', project: imported });
  assert.doesNotMatch(preview.configContent, /PIN = 12/);
  assert.match(preview.configContent, /CONDITIONAL = 7/);
});

test('preserved library source is exported exactly as imported without another download', () => {
  const p = project();
  p.libraries = [
    {
      id: 'sensor',
      name: 'Sensor',
      source: 'local',
      version: 'local',
      headers: ['Sensor.hpp'],
      dependencies: [],
      files: {
        'Sensor.hpp': '#pragma once\n',
        'Sensor.cpp': 'int sample() { return 1; }\n',
      },
    },
  ];
  p.nodes[0].libraryIds = ['sensor'];
  const first = exportTo(p);
  const modified =
    'int sample() { return 25; } // local implementation change\n';
  fs.writeFileSync(path.join(first, 'components/Sensor/Sensor.cpp'), modified);
  const imported = request({
    op: 'import-project',
    path: path.join(first, 'espresso.project.json'),
  }).project;
  const second = exportTo(imported);
  assert.equal(
    fs.readFileSync(path.join(second, 'components/Sensor/Sensor.cpp'), 'utf8'),
    modified,
  );
});

test('config and file-name collisions produce actionable errors without overwriting preserved data', () => {
  const p = project();
  p.configFile = {
    path: 'config/Config.hpp',
    content:
      '#pragma once\nnamespace Config::adc { inline constexpr int pins[2] = {11, 12}; }\n',
  };
  p.nodes[0].parameters = [
    { name: 'pins', type: 'int', value: '3', label: '', description: '' },
  ];
  let preview = request({ op: 'preview', project: p });
  assert.equal(preview.valid, false);
  assert.ok(
    preview.diagnostics.some((d) => d.message.includes('cannot edit safely')),
  );
  p.nodes[0].parameters = [];
  p.extraFiles = {
    'main/tasks/GPS_task.cpp': Buffer.from('my handwritten driver').toString(
      'base64',
    ),
  };
  p.nodes.push(task('gps'));
  preview = request({ op: 'preview', project: p });
  assert.equal(preview.valid, false);
  assert.ok(
    preview.diagnostics.some((d) =>
      d.message.includes('conflicts with generated'),
    ),
  );
  assert.equal(
    Buffer.from(p.extraFiles['main/tasks/GPS_task.cpp'], 'base64').toString(),
    'my handwritten driver',
  );
});

test('removing a task keeps its namespace and a later task cannot silently overwrite those constants', () => {
  const p = project();
  p.configFile = {
    path: 'config/Config.hpp',
    content:
      '#pragma once\nnamespace Config::adc { inline constexpr int PIN = 11; }\n',
  };
  p.nodes = [task('gps')];
  assert.ok(
    request({ op: 'preview', project: p }).configContent.startsWith(
      p.configFile.content,
    ),
  );
  const adc = task('adc');
  adc.parameters = [
    { name: 'PIN', type: 'int', value: '99', label: '', description: '' },
  ];
  p.nodes.push(adc);
  const preview = request({ op: 'preview', project: p });
  assert.equal(preview.valid, false);
  assert.ok(
    preview.diagnostics.some((d) =>
      d.message.includes('original value is retained'),
    ),
  );
});

test('ordinary include guards and reopened namespaces expose scalar constants without changing the file', () => {
  const p = project(),
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'espresso-guard-'));
  const source =
    '#ifndef MYCONFIG\n#define MYCONFIG\nnamespace Config::adc { constexpr unsigned long COUNT = 12; }\nnamespace Config { namespace adc { inline constexpr bool ENABLED = true; } }\n#endif\n';
  const file = path.join(root, 'Config.hpp');
  fs.writeFileSync(file, source);
  const imported = request({
    op: 'import-config',
    project: p,
    path: file,
  }).project;
  assert.deepEqual(
    imported.nodes[0].parameters.map((v) => v.name),
    ['COUNT', 'ENABLED'],
  );
  assert.equal(imported.configFile.content, source);
  const rendered = request({ op: 'preview', project: imported }).configContent;
  assert.match(rendered, /COUNT = 12/);
  assert.match(rendered, /ENABLED = true/);
  assert.ok(rendered.endsWith('#endif\n'));
});
