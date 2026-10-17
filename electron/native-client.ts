import { spawn } from 'node:child_process';

export function createNativeClient(executable: () => string) {
  async function native<T = any>(
    request: unknown,
    timeoutMs = 30000,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable(), [], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let output = '',
        errors = '';
      let settled = false;
      const timer = setTimeout(() => {
        child.kill();
        finish(
          new Error('The C++ backend did not respond within the allowed time.'),
        );
      }, timeoutMs);
      function finish(error?: Error, result?: T) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        error ? reject(error) : resolve(result!);
      }
      child.on('error', (error) =>
        finish(new Error(`Could not start the C++ backend: ${error.message}`)),
      );
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (data: string) => {
        output += data;
        if (output.length > 32 * 1024 * 1024) {
          child.kill();
          finish(new Error('Backend response is too large.'));
        }
      });
      child.stderr.on(
        'data',
        (data: Buffer) => (errors += data.toString('utf8')),
      );
      child.on('close', (code) => {
        if (settled) return;
        try {
          if (code !== 0)
            throw new Error(errors || `C++ backend exited with code ${code}`);
          const answer = JSON.parse(output);
          if (!answer.ok) throw new Error(answer.error);
          finish(undefined, answer.result);
        } catch (e) {
          finish(e instanceof Error ? e : new Error(String(e)));
        }
      });
      child.stdin.on('error', (error) => finish(error));
      child.stdin.end(JSON.stringify(request));
    });
  }

  return native;
}
