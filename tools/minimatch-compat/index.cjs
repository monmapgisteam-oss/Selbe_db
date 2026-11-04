// ESLint's legacy plugins require a callable CommonJS export. Matching and
// pattern limits come entirely from the patched upstream implementation.
const { minimatch } = require('minimatch-modern');

function legacy(fn) {
  const match = Object.assign((...args) => fn(...args), fn);
  match.minimatch = match;
  match.defaults = (options) => legacy(fn.defaults(options));
  // eslint-plugin-import only calls .test() on makeRe's result. Version 11
  // deliberately removed regex generation; keep its bounded matching engine.
  match.makeRe = (pattern, options) => {
    const matcher = new fn.Minimatch(pattern, options);
    return { test: (value) => matcher.match(value) };
  };
  return match;
}

module.exports = legacy(minimatch);
