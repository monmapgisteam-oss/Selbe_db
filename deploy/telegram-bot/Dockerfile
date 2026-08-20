# Сэлбэ AI туслах — Telegram ботын 24/7 дүрс (Linux сервер).
#
# ⚠️ BUILD CONTEXT нь РЕПО-ГИЙН ҮНДЭС байх ЁСТОЙ — бот `src/lib/*`-ийг шууд
#    импортолдог (React-аас хамааралгүй цэвэр TypeScript цөм). Тиймээс:
#        docker build -f deploy/telegram-bot/Dockerfile -t selbe-telegram-bot .
#    эсвэл энэ хавтсаас `docker compose up -d --build` (context нь ../..).
#
# ⚠️ Node 24 — хөгжүүлэлтийн орчинтой ижил. `--experimental-transform-types`
#    (bot script) энэ хувилбарт дэмжигдэнэ.

FROM node:24-slim

WORKDIR /app

# ── Хараат сангууд ──
# ⚠️ Ботын цөм зөвхөн `react`-аас (totals.ts → useAsync.ts) шууд хамаарна;
#    `@arcgis/core`-ийг ЗӨВХӨН нэвтрэлт асаалттай үед динамикаар дуудна —
#    бид доор `NEXT_PUBLIC_AUTH_APP_ID`-г хоослож тэр замыг бүрмөсөн хаана.
#    Гэвч lockfile-ийн бүрэн бүтэн байдлын төлөө порталтай ИЖИЛ `npm ci`
#    ашиглана (найдвартай, дахин давтагдах угсралт).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Эх код ──
COPY src ./src
COPY tools ./tools

# Зөвшөөрсөн хэрэглэгчийн жагсаалт тусдаа volume-д — контейнер шинэчлэгдэхэд устахгүй
ENV TELEGRAM_USERS_FILE=/data/telegram-users.json
RUN mkdir -p /data

# ⚠️ Browser-гүй тул ArcGIS нэвтрэлтийг УНТРААНА — реле рүү `AGENT_BOT_SECRET`-ээр
#    батална. Ингэснээр `@arcgis/core`-ийн IdentityManager импорт огт хийгдэхгүй.
ENV NEXT_PUBLIC_AUTH_APP_ID=""

# Уян хатан унтралт (long-poll гогцоо SIGINT-д цэвэр зогсоно)
STOPSIGNAL SIGINT

CMD ["npm", "run", "bot"]
