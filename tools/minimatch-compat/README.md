# Legacy ESLint matcher compatibility

Several ESLint plugins still call the CommonJS function exported by minimatch 3.
The patched minimatch 11 instead exports an object containing that function.
This adapter exposes the upstream function and its named helpers. The legacy
`makeRe` consumer (`eslint-plugin-import`) uses only `.test()`, so that method
delegates to the new matcher instead of recreating the removed regex engine.
The result is a test-only matcher, not a general RegExp. All patterns use
minimatch 11.0.4's security fixes.

The root dev dependency and `$minimatch` override keep the local package hoisted
at a portable path. Minimatch 10 consumers use version 11 directly. Keep this
adapter until all legacy consumers support the modern exports, then remove the
local dependency and override together. Validate with `npm ci`, `npm test`,
`npm run lint`, and `npm audit` after changing either the adapter or its engine.
