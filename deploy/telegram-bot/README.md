# Сэлбэ AI туслах — Telegram бот 24/7 (Linux)

Порталын AI туслахыг Telegram-аар, **тасралтгүй (24/7)** ажиллуулах байршуулалт.
Ботын код (`tools/telegram-bot.mjs`) бэлэн — энэ хавтас нь түүнийг Linux сервер
дээр унтралт/reboot-ыг давж, өөрөө сэргэдэг үйлчилгээ болгон тавихад хэрэгтэй.

## Архитектур

```
Telegram  →  [бот процесс: src/lib/agent цөм]  →  Cloudflare реле  →  Claude
                       │
                       └────────────────────────→  ArcGIS (шууд, өгөгдөл)
```

- **Реле** (`selbe-agent.monmapgisteam.workers.dev`) аль хэдийн 24/7 — Anthropic
  түлхүүр зөвхөн тэнд байна. Энэ ботыг зөвхөн **амьд байлгах** асуудал үлдэнэ.
- Бот нь ArcGIS хэрэглэгч БИШ тул реле рүү **`BOT_SECRET` нууцаар** батална
  (доор). Хэн ботыг ашиглахыг ботын **өөрийн цагаан жагсаалт** барина.

## Урьдчилсан нөхцөл

| Юу | Хаанаас |
|---|---|
| Ботын токен | Telegram → `@BotFather` → `/newbot` |
| Өөрийн Telegram ID (админ) | Telegram → `@userinfobot` |
| `BOT_SECRET` нууц | `openssl rand -hex 32` |
| Linux сервер | Docker **эсвэл** Node 24+ |

---

## 1-р алхам — Cloudflare реле дээр `BOT_SECRET` тавих  ⚠️ ЭНИЙГ ТА ӨӨРӨӨ ХИЙНЭ

Реле нь `ARCGIS_ORG_ID`-тай тул ArcGIS токен шаарддаг. Бот токенгүй учир
нэг удаагийн нууц түлхүүрээр батлах ёстой. Нэг нууц үүсгээд хоёр газар (реле +
бот) ИЖИЛ тавина.

```sh
# нэг удаа нууц үүсгэ — энэ утгыг ботын .env-д мөн бичнэ
openssl rand -hex 32

cd agent-proxy
npx wrangler secret put BOT_SECRET     # дээрх утгыг буулгана (дэлгэцэд харагдахгүй)
npx wrangler deploy                    # шинэ worker.mjs (bot-bypass)-ыг идэвхжүүлнэ
```

> ⚠️ **Зардлын сануулга:** реле дахин байршуулах нь Anthropic данс руу холбоотой.
> Байршуулахаас өмнө [console.anthropic.com](https://console.anthropic.com) →
> **Limits** дээр сарын дээд хязгаараа шалгаарай. (Хязгаар тохируулах ажил
> хойшлогдсон гэж тэмдэглэсэн — бот нээгдмэгц асуулт бүр төлбөртэй.)

Шалгах — реле амьд эсэх (нууц шаардахгүй эцэг цэг):

```sh
curl https://selbe-agent.monmapgisteam.workers.dev/health
# {"ok":true,"model":"claude-opus-5","effort":"low"}
```

---

## 2-р алхам — Ботыг ажиллуулах

Эхлээд тохиргоогоо бэлд:

```sh
cd deploy/telegram-bot
cp .env.example .env
nano .env          # TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED, AGENT_BOT_SECRET бөглөнө
```

`AGENT_BOT_SECRET` нь **1-р алхмын нууцтай ЯГ ижил** байх ёстой.

### Хувилбар A — Docker (зөвлөж байна)

```sh
cd deploy/telegram-bot
docker compose up -d --build
docker compose logs -f            # "@<бот> асаалттай" гарах ёстой
```

- `restart: unless-stopped` тул унасан ч, сервер reboot хийсэн ч өөрөө сэргэнэ
  (Docker демон boot-д асдаг эсэхийг шалга: `sudo systemctl enable docker`).
- Зөвшөөрсөн хэрэглэгчид `bot-data` volume-д үлдэнэ — redeploy хийхэд УСТАХГҮЙ.

Удирдах:

```sh
docker compose ps
docker compose restart
docker compose down               # зогсоох
docker compose up -d --build      # код шинэчилсний дараа
```

### Хувилбар B — systemd (Docker-гүй)

```sh
sudo git clone <репо> /opt/selbe-db
cd /opt/selbe-db && npm ci --omit=dev
cp deploy/telegram-bot/.env.example deploy/telegram-bot/.env && nano deploy/telegram-bot/.env

sudo cp deploy/telegram-bot/selbe-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now selbe-bot
journalctl -u selbe-bot -f
```

`Restart=always` тул унасан даруй сэргэнэ; `enable` нь boot-д асаана.
(`ExecStart`-ын npm зам өөр бол `which npm`-ээр тааруул.)

---

## Ботыг ашиглах

1. Telegram-д ботоо олж `/start` бичнэ.
2. Админ (`.env`-ийн `TELEGRAM_ALLOWED`) шууд ажиллана.
3. Танихгүй хүн бичихэд **админд зөвшөөрлийн товч** ирнэ
   (`✅ Зөвшөөрөх` / `🔵 Зөвхөн төлөвлөлт` / `❌ Татгалзах`). Хэн ч өөрөө
   нэмэгдэхгүй.
4. Тушаалууд: `/help`, `/new` (яриа шинэчлэх), `/users` (зөвхөн админ).

---

## Асуудал шийдэх

| Шинж тэмдэг | Шалтгаан / засвар |
|---|---|
| `✗ Реле хариулахгүй байна` (эхлэхэд) | `NEXT_PUBLIC_AGENT_API` буруу, эсвэл релег байршуулаагүй. `/health`-ыг curl-дэж шалга. |
| Асуулт бүрд `Нэвтрэлтийн хугацаа дууссан…` (401) | `AGENT_BOT_SECRET` (бот) ≠ `BOT_SECRET` (worker). Хоёуланг ижил тавиад worker-ыг дахин deploy хийсэн эсэхээ шалга. |
| `TELEGRAM_BOT_TOKEN алга` | `.env` бөглөөгүй, эсвэл Docker/systemd `.env`-ээ уншаагүй. |
| `TELEGRAM_ALLOWED хоосон` | Ядаж нэг админ ID тавь — админгүйгээр аюулгүйн үүднээс ажиллахгүй. |
| Хариулт удаан (10–20с) | Хэвийн — Opus 5 + ArcGIS татна. `AGENT_MODEL=claude-haiku-4-5` (worker vars) хурдасгана. |

---

## Хувилбар C — реле өөрчлөхгүй бол (fallback)

Worker-ыг огт хөндөхийг хүсэхгүй бол локал релег (`agent-proxy/server.mjs`) ботын
**хажууд ижил сервер дээр** ажиллуулж болно — тэр ArcGIS токен шалгадаггүй.
Тэгвэл `NEXT_PUBLIC_AGENT_API=http://127.0.0.1:8787`, `AGENT_BOT_SECRET` хэрэггүй,
харин `ANTHROPIC_API_KEY` тэр сервер дээр байх ба **хоёр процесс** (реле + бот)
асаалттай байлгах хэрэгтэй болно. Cloudflare реле сонгосон тул үндсэн зам нь
дээрх A/B хувилбар.

---

## Код өөрчлөлтүүд (энэ ажлаар нэмэгдсэн)

- `agent-proxy/worker.mjs` — `x-bot-secret` тохирвол ArcGIS шалгалтыг алгасна.
- `agent-proxy/wrangler.toml` — `BOT_SECRET` нууцын тайлбар.
- `src/lib/agent/client.ts` — Node орчинд `AGENT_BOT_SECRET`-ыг толгойд нэмнэ
  (browser build-д огт нөлөөгүй).
- `tools/telegram-bot.mjs` — `TELEGRAM_USERS_FILE`-ээр жагсаалтын замыг солино.
