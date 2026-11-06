import test from 'node:test';
import assert from 'node:assert/strict';
import {
  distribution,
  releaseFilename,
  packagedApp,
} from '../scripts/distribution.mjs';

test('each supported host has a unique package name and a matching local application', () => {
  for (const [platform, arch, name, extension] of [
    ['win32', 'x64', 'Windows', 'exe'],
    ['darwin', 'x64', 'macOS-x64', 'zip'],
    ['darwin', 'arm64', 'macOS-arm64', 'zip'],
    ['linux', 'x64', 'Linux-x64', 'tar.gz'],
    ['linux', 'arm64', 'Linux-arm64', 'tar.gz'],
  ]) {
    assert.equal(
      releaseFilename('1.4.0', platform, arch),
      `ESPresso-1.4.0-${name}.${extension}`,
    );
    assert.equal(distribution(platform, arch).extension, extension);
    assert.ok(packagedApp(undefined, platform, arch).includes('release'));
  }
  for (const [platform, arch] of [
    ['win32', 'arm64'],
    ['linux', 'ia32'],
    ['freebsd', 'x64'],
  ]) {
    assert.equal(releaseFilename('1.4.0', platform, arch), null);
    assert.throws(
      () => packagedApp(undefined, platform, arch),
      /Unsupported package/,
    );
  }
});
