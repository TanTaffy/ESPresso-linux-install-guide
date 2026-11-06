import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  buildExecutable,
  nativeExecutable,
  packagedNativeExecutable,
} from '../scripts/native-paths.mjs';

test('backend and harness paths use the host suffix in source and packaged layouts', () => {
  const root = path.resolve('folder with spaces');
  const resources = path.join(root, 'app resources');
  for (const [platform, suffix] of [
    ['win32', '.exe'],
    ['darwin', ''],
    ['linux', ''],
  ]) {
    assert.equal(
      nativeExecutable(root, platform),
      path.join(root, 'build/native/bin/Release', `espresso-core${suffix}`),
    );
    assert.equal(
      packagedNativeExecutable(resources, platform),
      path.join(resources, 'core', `espresso-core${suffix}`),
    );
    assert.equal(
      buildExecutable(
        path.join(root, 'firmware build'),
        'firmware-check',
        platform,
      ),
      path.join(root, 'firmware build/bin/Release', `firmware-check${suffix}`),
    );
  }
});
