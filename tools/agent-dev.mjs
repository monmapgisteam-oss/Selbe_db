/** Loopback-only development relay. Production relay settings stay in agent-proxy/.env.local. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../agent-proxy/', import.meta.url));
const child = spawn(process.execPath, ['--env-file-if-exists=.env.local', 'server.mjs'], {
  cwd,
  windowsHide: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: '8787',
    ARCGIS_ORG_ID: '',
    TRUSTED_PROXY: '',
    ALLOW_ORIGIN: 'http://localhost:8123,http://127.0.0.1:8123,http://localhost:8199,http://127.0.0.1:8199',
  },
});
child.once('error', (e) => { console.error(`agent:dev: ${e.message}`); process.exitCode = 1; });
child.once('exit', (code) => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { child.kill(); });
