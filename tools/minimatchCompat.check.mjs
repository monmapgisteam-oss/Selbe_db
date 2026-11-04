import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Exercise resolution from the real consumers, including scoped packages.
for (const consumer of ['eslint', '@eslint/config-array', '@eslint/eslintrc',
  'eslint-plugin-react', 'eslint-plugin-import', 'eslint-plugin-jsx-a11y']) {
  const fromConsumer = createRequire(require.resolve(consumer));
  const match = fromConsumer('minimatch');
  assert.equal(typeof match, 'function', `${consumer}: legacy callable export`);
  assert.equal(match('src/app/page.tsx', '**/*.{ts,tsx}'), true);
  assert.equal(match('src/app/page.css', '**/*.{ts,tsx}'), false);
  assert.equal(match('src/.hidden.ts', '**/*.ts'), false);
  assert.equal(match('src/.hidden.ts', '**/*.ts', { dot: true }), true);
  assert.equal(match('src/app/page.tsx', '*.tsx', { matchBase: true }), true);
  assert.equal(match('private/data.ts', '!private/**'), false);
  assert.equal(match('index.ts', '*.+(ts|tsx)'), true);
  assert.equal(new match.Minimatch('src/**').match('src/a.ts'), true);
  assert.equal(match.makeRe('*.ts').test('index.ts'), true);
  assert.deepEqual(match.match(['a.ts', 'b.js'], '*.ts'), ['a.ts']);
  assert.deepEqual(match.braceExpand('a{1,2}.ts'), ['a1.ts', 'a2.ts']);
  assert.equal(match.defaults({ nocase: true })('INDEX.TS', '*.ts'), true);
}

const { minimatch } = require('minimatch-modern');
assert.equal(minimatch('src/app/page.tsx', '**/*.tsx'), true);
// A real legacy rule must still reject forbidden imports through makeRe().
const { Linter } = require('eslint');
const importPlugin = require('eslint-plugin-import');
const messages = new Linter().verify("import value from 'private/secret';", [{
  plugins: { import: importPlugin },
  rules: { 'import/no-internal-modules': ['error', { forbid: ['private/**'] }] },
}]);
assert.equal(messages.length, 1);
assert.equal(messages[0].ruleId, 'import/no-internal-modules');
console.log('minimatch compatibility: legacy consumers, helpers, glob options passed');
