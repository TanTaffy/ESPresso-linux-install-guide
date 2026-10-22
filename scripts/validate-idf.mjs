import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
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
const project = request({ op: 'example' }).project;
const folder = path.resolve('build/idf-validation');
fs.mkdirSync(folder, { recursive: true });
const destination = path.join(folder, project.name);
// Exercise the real exporter, including its fresh GitHub release download.
const exportParent = fs.mkdtempSync(path.join(folder, 'export-'));
const exported = request({ op: 'export', project, path: exportParent });
function copyFixture(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name),
      to = path.join(target, entry.name);
    if (entry.isDirectory()) copyFixture(from, to);
    else fs.copyFileSync(from, to);
  }
}
copyFixture(exported.path, destination);
console.log(destination);
