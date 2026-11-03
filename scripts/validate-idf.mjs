import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const idfPath = process.env.IDF_PATH;
if (!idfPath || !fs.existsSync(path.join(idfPath, 'tools/idf.py')))
  throw new Error(
    'Activate ESP-IDF first (run its export.ps1), then run npm run test:idf.',
  );
const core = path.resolve('build/native/Release/espresso-core.exe');
const request = (value) => {
  const r = JSON.parse(
    execFileSync(core, [], {
      input: JSON.stringify(value),
      encoding: 'utf8',
      windowsHide: true,
    }),
  );
  if (!r.ok) throw Error(r.error);
  return r.result;
};
const project = request({
  op: 'load',
  path: path.resolve('examples/pressure-node.espresso.json'),
}).project;
const folder = path.resolve('build/idf-validation');
fs.mkdirSync(folder, { recursive: true });
// Use a fresh output directory so each check validates an ordinary untouched export.
const exportParent = fs.mkdtempSync(path.join(folder, 'export-'));
const exported = request({ op: 'export', project, path: exportParent });
const python = process.env.IDF_PYTHON_ENV_PATH
  ? path.join(
      process.env.IDF_PYTHON_ENV_PATH,
      process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
    )
  : process.platform === 'win32'
    ? 'python'
    : 'python3';
const idf = path.join(idfPath, 'tools/idf.py');
for (const args of [['set-target', project.target], ['build']]) {
  execFileSync(python, [idf, ...args], {
    cwd: exported.path,
    stdio: 'inherit',
    windowsHide: true,
  });
}
const binary = path.join(exported.path, 'build', `${project.name}.bin`);
if (!fs.existsSync(binary))
  throw new Error(`Firmware was not produced: ${binary}`);
console.log(`Unmodified ESPresso export built successfully: ${binary}`);
