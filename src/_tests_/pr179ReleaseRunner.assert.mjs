import assert from 'node:assert/strict';
import { resolveChecks, runChecks, suites } from '../../scripts/release-gate.mjs';
import fs from 'node:fs';

const command = 'node src/_tests_/example.assert.mjs';
assert.equal(resolveChecks({ a: `${command} && npm run qa:b`, 'qa:b': command }, ['a']).length, 1);
assert.throws(() => resolveChecks({ 'qa:a': 'npm run qa:a' }, ['qa:a']), /Circular/);
assert.throws(() => resolveChecks({}, ['missing']), /Missing/);
assert.throws(() => resolveChecks({ a: 'node script.mjs; echo unsafe' }, ['a']), /Unsupported/);
assert.throws(() => resolveChecks({}, []), /no checks/);
const results = runChecks([['a'], ['b'], ['c']], '.', (exe, args, options) => {
  assert.equal(exe, process.execPath);
  assert.equal(options.shell, false);
  return args[0] === 'a' ? { status: 0 } : args[0] === 'b' ? { status: 1 } : { status: null, error: { code: 'ETIMEDOUT' } };
});
assert.deepEqual(results.map(result => result.passed), [true, false, false]);
const scripts = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url))).scripts;
const checks = resolveChecks(scripts, suites);
assert.ok(checks.some(args => args.at(-1).includes('personaRegression')));
assert.ok(checks.some(args => args.at(-1).includes('pr178')));
assert.ok(checks.some(args => args.at(-1).includes('pr177')));
console.log('PR179 release runner assertions passed.');
