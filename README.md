# Сэлбэ портал

Сэлбэ төслийн орон зайн хяналтын систем (Next.js 15, `output: 'export'` статик сайт → GitHub Pages).

- Систем хэрхэн ажилладаг (өгөгдөл, эрх, харагдац): [`docs/SYSTEM.md`](docs/SYSTEM.md)
- Ажлын дүрэм, байнгын занга (ArcGIS, Enterprise, i18n): [`CLAUDE.md`](CLAUDE.md)

## Хөгжүүлэлтийн орчин

1. **Node 22** (`.nvmrc`, `package.json` → `engines`; CI ч 22). Өөр мажор дээр `npm test` анхааруулна.
2. `npm ci`
3. `cp .env.example .env` — Enterprise-ийн нийтийн 3 хаяг бөглөгдсөн; үлдсэнийг (APP_ID, ORG_ID, ХАБЭА нэрс …)
   GitHub → Settings → Variables-аас эсвэл админаас авч бөглөнө. Хоосон бол ~28 шалгуур унана.
   Нууц (`ARCGIS_ADMIN_TOKEN`) зөвхөн `.env.development.local`-д — репод хэзээ ч бичихгүй.
4. `npm run dev` — порт **8123**. Өөр worktree-д зэрэг ажиллуулахдаа портыг өгнө: `npx next dev -p 5001`.

## Ажил дуусахад давах шалгалт

```
npx tsc --noEmit
npm run lint                   # 0 алдаа, warning нь --max-warnings хязгаараас хэтрэхгүй
npm test                       # нэгж шалгуурууд (src · docs · tools доторх *.check.mjs)
node tools/i18n-extract.mjs    # дутуу 0, илүүдэл 0
```

- `npm run test:strict` — амьд шалгуур алгасагдах байвал (токен хүчингүй, Enterprise хүрэгдэхгүй) унана.
  Enterprise хүрэгддэг сүлжээнд л; GitHub Actions-д биш.
- `npm run test:all` — дээр нь agent-proxy реле шаарддаг амьд шалгуурууд (`cd agent-proxy && npm i`).
- `next build`-ийг хөгжүүлэгчийн репод ажиллуулахгүй (dev серверийн кэшийг эвдэнэ) — CI (`test.yml`) build хийнэ.

## Байршуулалт

`main` руу push → `.github/workflows/deploy.yml`: typecheck · lint · i18n · test · build · `out/` шалгалт → Pages.
Бусад салбар ба PR → `.github/workflows/test.yml` (ижил шалгалт, байршуулахгүй). «Порталын хэсгүүд» (тусламж)
цонхны доор build-ийн commit («Хувилбар: abc1234») харагдана — алдааны мэдээллийг commit-той холбоход.
