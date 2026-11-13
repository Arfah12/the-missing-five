#!/usr/bin/env node
/**
 * Starts the game server and the Vite client together with prefixed,
 * coloured output. No extra dependency (like `concurrently`) required.
 * Ctrl+C stops both, on Windows, macOS and Linux.
 */
import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';

const procs = [
  { name: 'server', color: '\x1b[31m', cmd: 'npm run dev -w @tmf/server' },
  { name: 'client', color: '\x1b[36m', cmd: 'npm run dev -w @tmf/client' },
];

const reset = '\x1b[0m';
const children = [];
let shuttingDown = false;

function prefixStream(stream, out, label) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) out.write(`${label} ${line}\n`);
  });
  stream.on('end', () => {
    if (buffer) out.write(`${label} ${buffer}\n`);
  });
}

function killTree(child) {
  if (child.exitCode !== null || child.killed) return;
  if (isWin) {
    // child.kill() does not stop grandchildren (npm -> node) on Windows.
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) killTree(c);
  setTimeout(() => process.exit(code), 500);
}

for (const p of procs) {
  const label = `${p.color}[${p.name}]${reset}`;
  const child = spawn(p.cmd, {
    shell: true,
    detached: !isWin,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  children.push(child);
  prefixStream(child.stdout, process.stdout, label);
  prefixStream(child.stderr, process.stderr, label);
  child.on('exit', (code) => {
    if (!shuttingDown) {
      process.stderr.write(`${label} exited with code ${code}. Stopping everything.\n`);
      shutdown(code ?? 1);
    }
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
