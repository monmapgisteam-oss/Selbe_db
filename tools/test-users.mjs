/**
 * НЭГЖ ТЕСТИЙН ХАТУУ ХЭРЭГЛЭГЧИД (2026-10-20) — `tools/test-all.mjs` бүх шалгуурт `--import`-оор ачаална.
 *
 * ⚠️ ЯАГААД: Enterprise руу шилжихэд `ROLE_BY_USER` (`services/roles.ts`)-аас AGOL-ын бүх аккаунт хасагдаж ганц
 *    `tumenjargal_selbe` (super) үлдсэн (хэрэглэгчийн шийдвэр). Гэтэл эрхийн тестүүд (aclE2E · aclParity ·
 *    guitsetgelAcl · permissions · negtgel) хатуу жагсаалтад super-ээс гадна `beginner` · `tolovlolt` үүрэгтэй,
 *    хэд хэдэн super-тэй аккаунт байхыг шаарддаг. Тиймээс ХУУЧИН жагсаалтыг ЗӨВХӨН тестийн процесст сэргээнэ —
 *    production кодонд (`roles.ts`) эдгээр нэр ОГТ байхгүй.
 * ⚠️ Модулиудаас ӨМНӨ ачаалагдана (`--import`) — `permsRemote.SUPER_OWNERS` г.м. импортын үед тооцогддог утгууд үүнийг харна.
 */
const { ROLE_BY_USER } = await import('../src/lib/services/roles.ts');
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
