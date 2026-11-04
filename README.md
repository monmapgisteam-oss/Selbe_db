# Сэлбэ портал

Сэлбэ төслийн орон зайн хяналтын систем (Next.js 15, `output: 'export'` статик сайт → GitHub Pages).

## Хөгжүүлэлтийн орчин

1. **Node 22.23.4** (`.nvmrc`, `.node-version`; CI ч Node 22). `npm ci` төслийн локал Node 22.23.4-ийг суулгана; `npm run …` командууд тэр хувилбарыг ашиглана. Терминалын шууд `node` команд өөр хувилбартай байж болох тул шалгалтуудыг npm script-ээр ажиллуулна.
2. `npm ci`
3. `cp .env.example .env` — Enterprise-ийн нийтийн 3 хаяг бөглөгдсөн; үлдсэнийг (APP_ID, ORG_ID, ХАБЭА нэрс …)
   GitHub → Settings → Variables-аас эсвэл админаас авч бөглөнө. Хоосон бол ~28 шалгуур унана.
   Нууц (`ARCGIS_ADMIN_TOKEN`) зөвхөн `.env.development.local`-д — репод хэзээ ч бичихгүй.
4. `npm run dev` — порт **8123**, зөвхөн localhost. Өөр worktree-д зэрэг ажиллуулахдаа портыг өгнө: `npx next dev -H 127.0.0.1 -p 5001`. Нэвтрэлт унтраалттай (`NEXT_PUBLIC_AUTH_OFF=1`) горимд admin токен зөвхөн уншина, бичилт ба автомат sync хаалттай.

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

## Байршуулалт

`main` руу push → `.github/workflows/deploy.yml`: typecheck · lint · i18n · test · build · `out/` шалгалт → Pages.
Бусад салбар ба PR → `.github/workflows/test.yml` (ижил шалгалт, байршуулахгүй). «Порталын хэсгүүд» (тусламж)
цонхны доор build-ийн commit («Хувилбар: abc1234») харагдана — алдааны мэдээллийг commit-той холбоход.
