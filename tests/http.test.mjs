import { buildExecutable } from '../scripts/native-paths.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const executable = buildExecutable('build/native', 'espresso-http-check');
assert.ok(
  existsSync(executable),
  'Build the native backend with BUILD_TESTING=ON first.',
);

async function get(request) {
  const child = exec(executable, [], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
    timeout: 10000,
    env: { ...process.env, NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' },
  });
  child.child.stdin.end(JSON.stringify(request));
  return JSON.parse((await child).stdout);
}

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET sends headers and preserves chunked UTF-8 response bytes', async () => {
  await withServer(
    (request, response) => {
      assert.equal(request.method, 'GET');
      assert.equal(request.url, '/source?ref=v1');
      assert.equal(request.headers.accept, 'application/vnd.github+json');
      assert.equal(request.headers['user-agent'], 'ESPresso');
      const body = Buffer.from('Source: café ☕\n');
      response.write(body.subarray(0, 13));
      response.end(body.subarray(13));
    },
    async (url) => {
      assert.deepEqual(
        await get({
          url: `${url}/source?ref=v1`,
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'ESPresso',
          },
        }),
        { status: 200, body: 'Source: café ☕\n' },
      );
    },
  );
});

test('HTTP errors return their status and body for the GitHub caller to handle', async () => {
  await withServer(
    (request, response) => {
      response.writeHead(Number(request.url.slice(1)));
      response.end('GitHub error');
    },
    async (url) => {
      for (const status of [403, 404, 429, 503])
        assert.deepEqual(await get({ url: `${url}/${status}` }), {
          status,
          body: 'GitHub error',
        });
    },
  );
});

test('the 2 MB limit accepts the boundary and rejects oversized chunked bodies', async () => {
  const limit = 2 * 1024 * 1024;
  await withServer(
    (request, response) => {
      response.write('a'.repeat(limit));
      response.end(request.url === '/large' ? 'b' : '');
    },
    async (url) => {
      const exact = await get({ url });
      assert.equal(exact.status, 200);
      assert.equal(exact.body.length, limit);
      assert.match((await get({ url: `${url}/large` })).error, /size limit/);
      assert.match((await get({ url, maxBodyBytes: 64 })).error, /size limit/);
    },
  );
});

test('timeouts abort a stalled response', async () => {
  await withServer(
    (_request, response) => response.writeHead(200).flushHeaders(),
    async (url) => {
      assert.match(
        (await get({ url, timeoutMs: 100 })).error,
        /timed out|Timeout/i,
      );
    },
  );
});

test('transport failures and invalid timeouts are errors', async () => {
  let closedUrl;
  await withServer(
    (_request, response) => response.end(),
    async (url) => {
      closedUrl = url;
    },
  );
  assert.match((await get({ url: closedUrl })).error, /connect/i);
  assert.match((await get({ url: closedUrl, timeoutMs: 0 })).error, /positive/);
});

test('local file URLs and redirects to plaintext or local files are refused', async () => {
  assert.match(
    (await get({ url: 'file:///never-read-this' })).error,
    /protocol/i,
  );
  await withServer(
    (request, response) => {
      const location =
        request.url === '/file' ? 'file:///never-read-this' : '/plain';
      response.writeHead(302, { Location: location });
      response.end();
    },
    async (url) => {
      for (const suffix of ['/file', '/plain'])
        assert.match((await get({ url: url + suffix })).error, /protocol/i);
    },
  );
});
