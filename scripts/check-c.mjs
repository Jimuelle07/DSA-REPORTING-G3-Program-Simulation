import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptDir);
const tempDir = path.join(os.tmpdir(), 'dsa-sims-check');

const PROGRAMS = {
  stack: {
    source: path.join(repoRoot, 'stack', 'c-source.js'),
    expected: path.join(scriptDir, 'expected-stack.txt'),
    binary: 'undo_redo'
  },
  queue: {
    source: path.join(repoRoot, 'queue', 'c-source.js'),
    expected: path.join(scriptDir, 'expected-queue.txt'),
    binary: 'drive_thru'
  }
};

const normalize = (text) => text.replace(/\r\n/g, '\n');

const loadSource = (sourcePath) => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(sourcePath, 'utf8'), context, { filename: sourcePath });
  if (typeof context.C_SOURCE !== 'string') {
    console.error(`${path.relative(repoRoot, sourcePath)} did not define C_SOURCE`);
    process.exit(1);
  }
  return context.C_SOURCE;
};

const checkProgram = (name, spec) => {
  const source = loadSource(spec.source);
  mkdirSync(tempDir, { recursive: true });
  const cPath = path.join(tempDir, `${spec.binary}.c`);
  const executablePath = path.join(tempDir, process.platform === 'win32' ? `${spec.binary}.exe` : spec.binary);
  writeFileSync(cPath, source, 'utf8');

  const compiler = process.env.CC || 'gcc';
  const compile = spawnSync(compiler, [
    '-std=c99',
    '-Wall',
    '-Wextra',
    '-Wpedantic',
    '-Werror',
    '-O2',
    '-o',
    executablePath,
    cPath
  ], { encoding: 'utf8' });

  if (compile.error?.code === 'ENOENT') {
    console.error('C compiler not found (set CC)');
    process.exit(2);
  }
  if (compile.error) {
    console.error(compile.error.message);
    process.exit(1);
  }
  if (compile.status !== 0 || compile.stdout || compile.stderr) {
    if (compile.stdout) process.stdout.write(compile.stdout);
    if (compile.stderr) process.stderr.write(compile.stderr);
    process.exit(1);
  }

  const run = spawnSync(executablePath, [], { encoding: 'utf8' });
  if (run.error) {
    console.error(run.error.message);
    process.exit(1);
  }
  if (run.status !== 0) {
    if (run.stdout) process.stdout.write(run.stdout);
    if (run.stderr) process.stderr.write(run.stderr);
    process.exit(1);
  }

  const expected = normalize(readFileSync(spec.expected, 'utf8'));
  const actual = normalize(run.stdout);
  if (actual !== expected) {
    const expectedLines = expected.split('\n');
    const actualLines = actual.split('\n');
    const lineCount = Math.max(expectedLines.length, actualLines.length);
    let differingLine = 0;
    for (let i = 0; i < lineCount; i++) {
      if (expectedLines[i] !== actualLines[i]) {
        differingLine = i + 1;
        break;
      }
    }
    console.error(`${name}: output mismatch at line ${differingLine}:`);
    console.error(`expected: ${expectedLines[differingLine - 1] ?? '<end of file>'}`);
    console.error(`actual:   ${actualLines[differingLine - 1] ?? '<end of file>'}`);
    process.exit(1);
  }

  const expectedName = path.relative(repoRoot, spec.expected).split(path.sep).join('/');
  console.log(`check-c: ${name} OK (compiled clean, output matches ${expectedName})`);
};

const requested = process.argv.slice(2);
const names = requested.length ? requested : Object.keys(PROGRAMS);
for (const name of names) {
  const spec = PROGRAMS[name];
  if (!spec) {
    console.error(`check-c: unknown program '${name}' (expected ${Object.keys(PROGRAMS).join(', ')})`);
    process.exit(1);
  }
  checkProgram(name, spec);
}
