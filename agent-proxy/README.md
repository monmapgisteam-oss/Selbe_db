# Сэлбэ AI туслах — реле (agent-proxy)

Порталын AI туслах ажиллахад хэрэгтэй **цорын ганц сервер тал**. LLM-ийн API
түлхүүрийг барих, Anthropic руу хүсэлт дамжуулах — өөр юу ч хийхгүй.

## Яагаад тусдаа вэ

Портал нь `output: 'export'` (бүрэн статик) бөгөөд GitHub Pages дээр байрлана —
тэнд Next-ийн route handler **ажиллахгүй**. Мөн API түлхүүр browser-т хэзээ ч
гарч болохгүй. Тиймээс реле нь тусдаа процесс, **тусдаа `package.json`**-той:
порталын `npm ci` / `npm run build` үүнийг огт хөндөхгүй тул одоогийн deploy
эвдрэхгүй.

## Ажиллуулах

```sh
cd agent-proxy
npm install
```

`agent-proxy/.env.local` файлд түлхүүрээ тавина (файл бэлэн үүссэн):

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

дараа нь:

```sh
npm start
```

Амжилттай бол:

```
[agent-proxy] http://localhost:8787  загвар=claude-opus-5  effort=low
```

> `.env.local` нь `.gitignore`-д орсон — репод хэзээ ч орохгүй.

Портал талд `npm run dev` (8123 порт) → баруун доод буланд «AI туслах».

## Тохиргоо

| Орчны хувьсагч | Анхдагч | Утга |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | **Заавал.** [console.anthropic.com](https://console.anthropic.com) |
| `AGENT_MODEL` | `claude-opus-5` | Хямд туршилтад `claude-haiku-4-5` |
| `AGENT_EFFORT` | `low` | `low` / `medium` / `high` — хурд ↔ гүн бодолт |
| `PORT` | `8787` | Релений порт |
| `ALLOW_ORIGIN` | `http://localhost:8123,…` | Зөвшөөрөх эх (таслалаар) |

Порталын талд `NEXT_PUBLIC_AGENT_API` (үндсэн `.env`) нь релений хаягийг заана.

## Тест

Репо-гийн үндсэн хавтаснаас — **түлхүүр шаардахгүй**:

```sh
npm run test:agent    # бүрэн гинж (загварыг хуурамч сервереэр орлуулна)
npm run test:drift    # код ↔ амьд ArcGIS хазайлт
```

## Юуг ЭНД бичихгүй вэ

Давхаргын жагсаалт, талбарын нэр, эрхийн шалгалт, асуулгын логик — **бүгд
browser талд** (`src/lib/agent/`). Учир нь тэнд `LAYERS`, `VIEWS`, `query.ts`
порталтай яг ижил кодоор ажилладаг. Реле давхаргын хуулбар хөтөлбөл тэр хуулбар
хоцроод агент байхгүй зүйлийн тухай ярьж эхэлнэ.

**Дүрэм:** шинэ давхарга нэмэгдэхэд энэ хавтсанд юу ч засагдах ёсгүй.

## Дараагийн алхам (deploy)

Локалаар батлагдсаны дараа Cloudflare Worker болгож `api.selbe.monmap.mn` дээр
байрлуулна — `createServer` нь `fetch` handler болно. Порталын GitHub Pages
deploy хэвээр үлдэнэ.
