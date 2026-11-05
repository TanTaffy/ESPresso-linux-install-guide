import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({
  entryPoints: ['electron/updates.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { availableUpdate, checkForUpdate, releasesApi } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`
);
const release = (version) => ({
  tag_name: `v${version}`,
  draft: false,
  prerelease: false,
  assets: [
    {
      name: `ESPresso-${version}-Windows.exe`,
      state: 'uploaded',
      size: 100,
      browser_download_url: `https://github.com/Trovix/ESPresso/releases/download/v${version}/ESPresso-${version}-Windows.exe`,
    },
  ],
});

test('only a newer stable version with the official Windows download is offered', () => {
  assert.equal(availableUpdate('1.9.9', release('1.10.0')).version, '1.10.0');
  assert.equal(availableUpdate('1.99.9', release('2.0.0')).version, '2.0.0');
  for (const version of ['1.3.1', '1.3.0', '1.2.99', '0.99.99'])
    assert.equal(availableUpdate('1.3.1', release(version)), null);
  for (const value of [
    null,
    {},
    [],
    { ...release('1.3.2'), draft: true },
    { ...release('1.3.2'), prerelease: true },
    { ...release('1.3.2'), assets: [] },
    release('1.3.2-beta.1'),
    release('01.3.2'),
    release('999999999999999999999.0.0'),
  ])
    assert.equal(availableUpdate('1.3.1', value), null);
  for (const patch of [
    { browser_download_url: 'https://example.com/installer.exe' },
    { state: 'new' },
    { size: 0 },
    { name: 'source.zip' },
  ]) {
    const value = release('1.3.2');
    Object.assign(value.assets[0], patch);
    assert.equal(availableUpdate('1.3.1', value), null);
  }
});

test('release check is bounded, uses the fixed GitHub endpoint, and fails quietly', async () => {
  const update = await checkForUpdate('1.3.1', async (url, options) => {
    assert.equal(url, releasesApi);
    assert.equal(options.headers['User-Agent'], 'ESPresso/1.3.1');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(release('1.3.2'));
  });
  assert.equal(update.version, '1.3.2');
  for (const fetcher of [
    async () => {
      throw Error('offline');
    },
    async () => new Response('', { status: 403 }),
    async () => new Response('', { status: 503 }),
    async () => new Response('not JSON'),
    async () => Response.json({}),
  ])
    assert.equal(await checkForUpdate('1.3.1', fetcher), null);
});
