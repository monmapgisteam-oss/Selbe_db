# Сэлбэ — Орон зайн мэдээллийн портал

Сэлбэ дэд төвийн GIS портал. Зүүн талын жагсаалтаас **давхарга идэвхжүүлэхэд** тухайн давхаргын дашбоард баруун талд нээгдэнэ.

Бүх үзүүлэлт ArcGIS FeatureServer-ээс **ажиллах үедээ шууд** татагдана. Апп дотор ямар ч жишиг, демо, зорилтот тоо байхгүй — өгөгдөл татагдаагүй бол тоо харуулахын оронд алдааг ил гаргана.

## Модулиуд

| Модуль | Эх сурвалж | Юу харуулах |
|---|---|---|
| **Багцын хил** | `bagts_hil` | Төслийн үндсэн хүрээ, багц тус бүрийн явц |
| **Бүсчлэл** | `Busiin_medeelel` | 84 бүс, FAR/BCR, зогсоолын хүртээмж, төсөв ба гүйцэтгэл |
| **Барилгын явц** | `building_GOL_barigdaj_ehelsen` | 112 блок, 4 түвшин, 16 үе шат, гүйцэтгэгч |
| **Үлдсэн нэгж талбар** | `20260226_uldsen_negj_talbar_selbe` | Чөлөөлөлтийн явц, эзэмшигч, шалтгаан |
| **Газрын үнэ тооцоолуур** | `…uldsen…` + `selbe_B` | Талбай зурж, доторх барилгын үнэлгээ, түрээс, ажлын байр |
| **Ерөнхий мэдээлэл** | `Selbe_talbain_hynalt` | Зам, ногоон байгууламж, гэр хороолол, гол |
| **Шугам сүлжээ ба зам** | `Road_shugam_suljee` | Инженерийн шугамын урт, замын план |
| **Талбайн хяналт** | `survey123_…_results` | Мобайл аппаас ирсэн амьд тайлан, илэрсэн асуудал |

Дэлгэрэнгүй талбар, тоо, анхаарах зүйлс: [DATA_DICTIONARY.md](DATA_DICTIONARY.md)

## Хөгжүүлэлт

```bash
npm install
npm run dev        # http://localhost:8123
npm run typecheck
npm run build      # static export → out/
```

## Технологи

- **Next.js 15** (App Router) — `output: 'export'` бүрэн статик
- **@arcgis/core 4.31** — газрын зураг. Asset-уудыг CDN-ээс ачаална (`esriConfig.assetsPath`), тиймээс bundle хөнгөн
- **TypeScript**, CSS Modules — гуравдагч UI сан хэрэглэхгүй

ArcGIS SDK нь браузерын API-д (WebGL, ResizeObserver) түшиглэдэг тул порталыг `next/dynamic` + `ssr: false`-ээр ачаална.

### Бүтэц

```
src/
  lib/services.ts     ← бүх ArcGIS URL, талбар, кодын ГАНЦ эх үүсвэр
  lib/query.ts        ← REST асуулга (fetch, POST). Алдааг залгихгүй.
  lib/format.ts       ← тоо, огноо, төгрөгийн формат
  lib/theme.tsx       ← цайвар/харанхуй
  components/         ← Portal бүрхүүл, MapCanvas, UI анхдагчууд
  modules/            ← модуль бүрийн дашбоард
```

Үйлчилгээний URL өөрчлөгдвөл **зөвхөн `src/lib/services.ts`**-ийг засна.

## Deploy

`main` салбар руу push хийхэд [GitHub Actions](.github/workflows/deploy.yml) статик export хийж GitHub Pages рүү гаргана → https://selbe.monmap.mn

> **Анхаар:** repo-гийн Settings → Pages → Source-ыг **"GitHub Actions"** болгож нэг удаа тохируулах шаардлагатай (өмнө нь branch-аас шууд serve хийдэг байсан).

## Суурь зураг

Нийтийн вектор тайлын portal item ашиглана — цайвар `291da5eab3a0412593b66d384379f89f`, харанхуй `5e9b3685f4c24d8781073dd928ebda50`.

ArcGIS 4.x-ийн нэрлэсэн суурь зураг (`gray-vector` гэх мэт) нь **API key шаарддаг** бөгөөд түлхүүргүй үед чимээгүй ачаалагдахгүй. Portal item хувилбар нь түлхүүр шаардахгүй.
