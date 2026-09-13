import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const suites = ['qa:pr178', 'qa:pr162', 'qa:pr161', 'qa:personas', 'qa:legal', 'qa:settings'];

// Resolve only our small, explicit script grammar. Never execute arbitrary shell text.
export function resolveChecks(scripts, roots) {
  const checks = new Map();
  function visit(name, ancestors = []) {
    if (ancestors.includes(name)) throw new Error(`Circular QA script: ${name}`);
    if (typeof scripts[name] !== 'string') throw new Error(`Missing QA script: ${name}`);
    for (const command of scripts[name].split('&&').map(value => value.trim())) {
      const nested = /^npm run (qa:[\w-]+)$/.exec(command);
      if (nested) { visit(nested[1], [...ancestors, name]); continue; }
      if (!/^node (?:--experimental-strip-types )?src\/_tests_\/[\w.-]+\.(?:mjs|ts)$/.test(command)) {
        throw new Error(`Unsupported QA command in ${name}: ${command}`);
      }
      checks.set(command, command.split(' ').slice(1));
    }
  }
  roots.forEach(name => visit(name));
  if (!checks.size) throw new Error('Release gate has no checks');
  return [...checks.values()];
}

export function runChecks(checks, cwd, execute = spawnSync) {
  return checks.map(args => {
    const started = Date.now();
    console.log(`\nChecking ${args.at(-1)}`);
    const result = execute(process.execPath, args, { cwd, stdio: 'inherit', timeout: 120000, shell: false });
    return { test: args.at(-1), passed: result.status === 0 && !result.error,
      exitCode: result.status, error: result.error?.code ?? null, durationMs: Date.now() - started };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  const { scripts } = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  const results = runChecks(resolveChecks(scripts, suites), cwd);
  const passed = results.every(result => result.passed);
  const report = { generatedAt: new Date().toISOString(), commit: process.env.GITHUB_SHA ?? null,
    automatedStatus: passed ? 'passed' : 'failed', releaseDecision: 'pending-manual-evidence',
    suites, results };
  fs.mkdirSync(path.join(cwd, 'artifacts'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'artifacts/release-gate.json'), JSON.stringify(report, null, 2));
  console.log(`\n${results.filter(result => result.passed).length}/${results.length} checks passed. Manual release evidence remains required.`);
  process.exitCode = passed ? 0 : 1;
}
