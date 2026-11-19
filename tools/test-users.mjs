/**
 * НЭГЖ ТЕСТИЙН ХАТУУ ХЭРЭГЛЭГЧИД (2026-10-20) — `tools/test-all.mjs` бүх шалгуурт `--import`-оор ачаална.
 */
const { ROLE_BY_USER } = await import('../src/lib/services/roles.ts');
/* 2026-11-19: шалгуурууд нэвтэрсэн админгүйгээр эрхийн хадгалалтыг дууддаг — бичилтийн хамгаалалтыг эндээс унтраана.
   Хамгаалалт өөрөө `src/lib/writeGuard.check.mjs`-д шалгагдана (тэнд буцааж асаана). */
(await import('../src/lib/who.ts'))._setWriteGuards(false);
Object.assign(ROLE_BY_USER, {
  bilguuntugs_monmap: 'super',
  enhsaandar_monmap: 'super',
  munkhbaatar_selbe: 'super',
  tumenjargal_monmap: 'super',
  narandulam_monmap: 'super',
  saruul_monmap: 'super',
  maralgoo_monmap: 'super',
  manager_3: 'super',
  selbe_et: 'beginner',
  selbe_redesign: 'tolovlolt',
});
