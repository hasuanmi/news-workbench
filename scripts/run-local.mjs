// Local entry point: load Next-compatible env files before choosing the port.
// Never kills another process or installs dependencies.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import dotenv from 'dotenv';

const command = process.argv[2] || 'dev';
if (!['dev', 'start'].includes(command)) throw new Error('Expected dev or start');
const mode = command === 'dev' ? 'development' : 'production';
process.env.NODE_ENV = mode;
for (const file of [`.env.${mode}.local`, '.env.local', `.env.${mode}`, '.env']) {
  if (fs.existsSync(file)) dotenv.config({ path: file, quiet: true });
}
const require = createRequire(import.meta.url);
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), command,
  '--port', process.env.PORT || '3000', ...process.argv.slice(3)], {
  stdio: 'inherit', env: process.env, windowsHide: true,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
