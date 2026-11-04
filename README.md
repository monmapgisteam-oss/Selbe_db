# Сэлбэ портал

Сэлбэ төслийн орон зайн хяналтын систем (Next.js 15, `output: 'export'` статик сайт → GitHub Pages).

## Хөгжүүлэлтийн орчин

1. **Node 22** (`.nvmrc`, `package.json` → `engines`; CI ч 22). Өөр мажор дээр `npm test` анхааруулна.
2. `npm ci` — төслийн `node` devDependency Node 22.23.4-ийг суулгана; `npm run …` скриптүүд
   төслийн Node 22-ыг хэрэглэнэ (системийн Node болон бусад төслийн орчныг солихгүй).
3. `cp .env.example .env` — Enterprise-ийн нийтийн 3 хаяг бөглөгдсөн; үлдсэнийг (APP_ID, ORG_ID, ХАБЭА нэрс …)
   GitHub → Settings → Variables-аас эсвэл админаас авч бөглөнө. Хоосон бол ~28 шалгуур унана.
   Нууц (`ARCGIS_ADMIN_TOKEN`) зөвхөн `.env.development.local`-д — репод хэзээ ч бичихгүй.
4. `npm run dev` — порт **8123**, зөвхөн `127.0.0.1` (нэвтрэлт унтраалттай үеийн dev токен LAN-д багцаар ил гарахгүй).
   Өөр worktree-д зэрэг ажиллуулахдаа портыг өгнө: `npx next dev -H 127.0.0.1 -p 5001`.
   Нэвтрэлт унтраалттай (`NEXT_PUBLIC_AUTH_OFF=1`) горимд admin токен зөвхөн уншина, бичилт ба автомат sync хаалттай.
5. Локал AI: `npm --prefix agent-proxy ci`, дараа нь тусдаа терминалд `npm run agent:dev`.
   Реле зөвхөн `127.0.0.1:8787`-д сонсож, 8123/8199 локал эхийг зөвшөөрнө; production-ийн
   байгууллагын нэвтрэлт/тунелийн тохиргоог өөрчлөхгүй. Claude Code-д нэвтэрсэн эсвэл
   `agent-proxy/.env.local`-д API түлхүүртэй байна. `http://127.0.0.1:8787/health` → `{"ok":true}`.

## Ажил дуусахад давах шалгалт

```
npm run typecheck
npm run lint                   # 0 алдаа, 0 warning
npm test                       # нэгж шалгуурууд (src · docs · tools доторх *.check.mjs)
npm run i18n:check             # дутуу 0, илүүдэл 0
```

- `npm run test:strict` — амьд шалгуурыг (`test:agent`, `test:drift` г.м.) хамт ажиллуулна; алгасагдах байвал (токен хүчингүй, Enterprise хүрэгдэхгүй) унана. `main` руу нэгтгэхийн өмнө ажиллуулна.
  Enterprise хүрэгддэг сүлжээнд л; GitHub Actions-д биш.
- `npm run test:all` — дээр нь agent-proxy реле шаарддаг амьд шалгуурууд (`cd agent-proxy && npm i`).
- `next build`-ийг хөгжүүлэгчийн репод ажиллуулахгүй (dev серверийн кэшийг эвдэнэ) — CI (`test.yml`) build хийнэ.

`package.json`-ийн `overrides` нь PostCSS-ийг 8.5.32+, орчин үеийн minimatch-ийг 11.0.4+ болгож
аюулгүй байдлын засварыг авна. ESLint-ийн хуучин plugin-уудын minimatch 3.1.5 нь function export
шаарддаг тул 11-р хувилбараар хүчээр солихгүй. `npm audit` GHSA-g3hv-75wg-m249-ийг `<11.0.1`
бүх хувилбарт тооцдог боловч [сангийн зохиогчийн advisory](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249)
10.2.6 дахь `firstPhasePreProcess`-ийг заадаг; 3.1.5-д тэр боловсруулалт байхгүй. Иймээс
хөгжүүлэлтийн хамаарлын анхааруулга үлдэж болно; audit-ыг унтраахгүй, production-ийг
`npm audit --omit=dev`, релег `npm --prefix agent-proxy audit`-аар тусад нь шалгана.

## Байршуулалт

`main` руу push → `.github/workflows/deploy.yml`: typecheck · lint · i18n · test · build · `out/` шалгалт → Pages.
Бусад салбар ба PR → `.github/workflows/test.yml` (ижил шалгалт, байршуулахгүй). «Порталын хэсгүүд» (тусламж)
цонхны доор build-ийн commit («Хувилбар: abc1234») харагдана — алдааны мэдээллийг commit-той холбоход.
