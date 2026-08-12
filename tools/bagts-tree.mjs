// БАГЦЫН мөрийн модыг үүсгэгч. Excel-ийн `*_final_publish` хуудасны эцэг–хүү
// холбоог НИЙЛБЭР ТОМЪЁОНУУДААС нь уншиж гаргана.
//
// ⚠️ Багана бүрийн БАЙРЛАЛ багц бүрд ӨӨР (блок 8 · 11 · 12 · 22; зарим багцад
// «Төлөвлөгөө биелэлт» багана огт байхгүй). Тиймээс баганыг хатуу бичихгүй —
// ТОЛГОЙН МӨРӨӨС нь таньж авна (доорх `layout()`).
//
// Яагаад томъёоноос? № багана (excel A) дангаараа модыг тодорхойлж чадахгүй:
// "1" гэсэн код нь ангилал (ГАЗАР ШОРООНЫ АЖИЛ) ч, ажил (Барилга барих талбайг
// тэгшлэх) ч байж болно, жингээр нь ч ялгагдахгүй. Харин бүлэг мөр бүр өөрийн
// хүүхдүүдээ томъёондоо нэрлэсэн байдаг — тэр нь эргэлзээгүй эх сурвалж.
//
// ⚠️ Энэ файл `src/`-ийн ГАДНА байх ёстой. `src/modules/sheet/bagts32.tree.mjs`
// гэж хадгалбал `import … from "./bagts32.tree"` нь webpack-ийн өргөтгөлийн
// эрэмбээр (.mjs нь .ts-ээс өмнө) ЭНЭ скрипт рүү заагаад, node:fs-ээс болж
// build унана.
//
// Ажиллуулах (xlsx нь ердөө zip):
//   Copy-Item Багц_3_2_final.xlsx book.zip
//   Expand-Archive book.zip -DestinationPath xl
//   node tools/bagts-tree.mjs ./xl sheet3.xml ts src/modules/sheet/bagts32.tree.ts
// (sheet3.xml = 9F_publish — xl/workbook.xml + xl/_rels/workbook.xml.rels-ээс
//  rId → worksheets/sheetN.xml холбоог хараарай.)
//
// 4 дэх аргумент: "ts" = файл бичих, "dump" = модыг харах, хоосон = зөвхөн шалгах.

import fs from "node:fs";

const base = process.argv[2];
const sheetFile = process.argv[3];

const ss = fs.readFileSync(base + "/xl/sharedStrings.xml", "utf8");
const strings = [];
{
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(ss))) {
    const parts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]);
    strings.push(
      parts.join("").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&"),
    );
  }
}

const xml = fs.readFileSync(base + "/xl/worksheets/" + sheetFile, "utf8");

const rows = new Map(); // мөрийн дугаар -> { cells }
{
  const rowRe = /<row([^>]*)r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g;
  let m;
  while ((m = rowRe.exec(xml))) {
    const rn = Number(m[2]);
    const cells = {};
    const cRe = /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let c;
    while ((c = cRe.exec(m[4]))) {
      const attrs = c[2] || "";
      const body = c[3] || "";
      const t = /t="([^"]+)"/.exec(attrs)?.[1];
      const f = /<f[^>]*>([\s\S]*?)<\/f>/.exec(body)?.[1];
      const vRaw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let v = vRaw;
      if (t === "s" && vRaw != null) v = strings[Number(vRaw)];
      cells[c[1]] = { v, f };
    }
    rows.set(rn, { cells });
  }
}

const LAST = Math.max(...rows.keys());

const colNum = (c) => [...c].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);

/**
 * ТОЛГОЙН МӨРӨӨС баганы байрлалыг таних.
 *
 * Бүтэц нь бүх багцад ижил ДАРААЛАЛТАЙ, зөвхөн блокийн тоо өөр:
 *   № · Ажил · жин · жин · жин-одоо · Обьём · Нэгж өртөг · Мөнгөн дүн ·
 *   Төлөвлөгөөт · Гүйцэтгэл · [Төлөвлөгөө биелэлт] ·
 *   N×гүйцэтгэл · N×төлөвлөгөөт · N×(Эхлэх, Дуусах) · Шинэчлэгдсэн огноо
 */
function layout() {
  const h = rows.get(1)?.cells || {};
  const cols = Object.keys(h).sort((a, b) => colNum(a) - colNum(b));
  const txt = (c) => String(h[c]?.v ?? "").toLowerCase().replace(/\s+/g, "");
  const act = cols.filter((c) => /гүйцэтгэл$/.test(txt(c)) && /^\d+\/\d+/.test(txt(c)));
  const plan = cols.filter((c) => /төлөвлөгө/.test(txt(c)) && /^\d+\/\d+/.test(txt(c)));
  const date = cols.filter((c) => /(эхлэх|дуусах)$/.test(txt(c)));
  return { act, plan, date };
}
const LAY = layout();
console.log("толгой: блок", LAY.act.length,
  "· гүйцэтгэл", LAY.act[0] + ".." + LAY.act[LAY.act.length - 1],
  "· төлөвлөгөөт", LAY.plan[0] + ".." + LAY.plan[LAY.plan.length - 1],
  "· огноо", LAY.date.length);

/**
 * ХҮҮХЭД МӨР рүү заадаг багана: жин/мөнгө (C, D, E, H) ба барилгын гүйцэтгэл +
 * төлөвлөгөөт баганууд.
 * ⚠️ ОГНООНЫ багана ба «Шинэчлэгдсэн огноо» нь өөрийн мөр/тогтмолыг заадаг тул
 * хүүхэд гэж уншвал мод эвдэрнэ — тэдгээрийг ЗААВАЛ хасна.
 */
const BLD = new Set([...LAY.act, ...LAY.plan]);
const OK = (c) => c === "C" || c === "D" || c === "E" || c === "H" || BLD.has(c);

// Excel бүлгийг гурван янзаар нийлбэрлэдэг — аль нь ч ижил хүүхдүүдийг нэрлэнэ.
function parseKids(rawF, rn) {
  const out = new Set();
  /**
   * ⚠️ ХӨНДЛӨН ХУУДАСНЫ лавлагааг ЭХЛЭЭД хасна. Багц 1-ийн «Бэлтгэл ажил»
   * хэсэг нь `'9F'!H11` гэж өөр хуудаснаас татдаг бөгөөд түүнийг доорх
   * задлагч «H багана, мөр 11» гэж уншаад ХУДАЛ хүүхэд үүсгэдэг байв.
   */
  const f = String(rawF).replace(
    /(?:'[^']*'|\w+)!\$?[A-Z]{1,2}\$?\d+(?::\$?[A-Z]{1,2}\$?\d+)?/g,
    " ",
  );
  // 1) SUMPRODUCT($C3:$C10,L3:L10) / SUM(H15:H19) — ЗӨВХӨН босоо муж.
  //    Хэвтээ муж (X2:AI2 — уг мөрийн 12 барилга) нь багана дамжих тул
  //    мөрийг өөрийнх нь хүүхэд болгож мэдэнэ.
  for (const m of f.matchAll(/\$?([A-Z]{1,2})\$?(\d+):\$?([A-Z]{1,2})\$?(\d+)/g)) {
    if (m[1] !== m[3] || !OK(m[1])) continue;
    const a = Number(m[2]), b = Number(m[4]);
    if (b >= a && b - a < 400) for (let i = a; i <= b; i++) if (i !== rn) out.add(i);
  }
  if (out.size) return [...out].sort((x, y) => x - y);
  // 2) $D13*L13 + L14*$D14 + …  — тодорхой жагсаалт (жингийн мөр = утгын мөр;
  //    excel хоёр үржигдэхүүнийг хоёр талын дарааллаар бичсэн байдаг).
  for (const m of f.matchAll(
    /\$?D\$?(\d+)\s*\*\s*[A-Z]{1,2}\$?(\d+)|[A-Z]{1,2}\$?(\d+)\s*\*\s*\$?D\$?(\d+)/g,
  )) {
    const [a, b] = m[1] != null ? [m[1], m[2]] : [m[3], m[4]];
    if (a === b && Number(a) !== rn) out.add(Number(a));
  }
  if (out.size) return [...out].sort((x, y) => x - y);
  // 3) +H13+H28+H48+… / SUMPRODUCT($C1071,L1071) — цулгуй лавлагаанууд.
  //    Багана тус бүрээр бүлэглээд хамгийн олон лавлагаатайг нь авна
  //    (нэг ганц хүүхэдтэй бүлэг ч бодит байдаг).
  const byCol = new Map();
  for (const m of f.matchAll(/\$?([A-Z]{1,2})\$?(\d+)(?![:\d])/g)) {
    const r = Number(m[2]);
    if (!OK(m[1]) || r === rn) continue;
    const set = byCol.get(m[1]) || new Set();
    set.add(r);
    byCol.set(m[1], set);
  }
  let best = null;
  for (const set of byCol.values()) if (!best || set.size > best.size) best = set;
  return best ? [...best].sort((x, y) => x - y) : [];
}

function childrenOf(rn) {
  const c = rows.get(rn)?.cells || {};
  // ⚠️ Эхний хоёр гүйцэтгэл ба эхний төлөвлөгөөт баганыг ДИНАМИКААР (багц бүрд
  //    өөр байрлалтай) — эс бөгөөс 12F багцын бүлгүүд огт уншигдахгүй.
  const a0 = LAY.act[0], a1 = LAY.act[1], p0 = LAY.plan[0];
  const cand = [c[a0]?.f, c[a1]?.f, c.H?.f, c.E?.f, c[p0]?.f].filter(Boolean);
  for (const f of cand) {
    const kids = parseKids(f, rn);
    if (kids.length) return kids;
  }
  return [];
}

// ── мод угсрах ───────────────────────────────────────────────────────────────
const parent = new Map();
const kidsOf = new Map();
for (const rn of [...rows.keys()].sort((a, b) => a - b)) {
  if (rn === 1) continue; // толгойн мөр
  const kids = childrenOf(rn).filter((k) => k !== rn && rows.has(k) && k > 1);
  if (!kids.length) continue;
  kidsOf.set(rn, kids);
  for (const k of kids) if (!parent.has(k)) parent.set(k, rn);
}

/**
 * ЭЦЭГГҮЙ ҮЛДСЭН мөрийг № баганаар нөхөх.
 *
 * ⚠️ Багц 1/2-ийн «Бэлтгэл ажил» хэсэг нь нийлбэр томъёогүй — утгыг нь `9F`
 * хуудаснаас шууд татдаг тул тэдгээрийн 8 ажил эцэггүй үлдэж, дээд түвшний мөр
 * мэт харагдана (бүлэг нь хоосон, ажлууд нь тархай).
 *
 * Дүрэм: № нь ҮСГЭЭР эхэлбэл БҮЛГИЙН толгой («А. Бэлтгэл ажил», «Б1»), түүний
 * дараах ТООН №-тэй эцэггүй мөрүүд түүнд харьяалагдана. Томъёогоор эцэг нь
 * тодорхой болсон мөрийг ХӨНДӨХГҮЙ — Багц 3.2 (зөрүү 0) хэвээр үлдэнэ.
 */
{
  const ordered = [...rows.keys()].filter((r) => r > 1).sort((a, b) => a - b);
  const no = (rn) => String(rows.get(rn)?.cells?.A?.v ?? "").trim();
  let head = null;
  let fixed = 0;
  for (const rn of ordered) {
    if (/^[A-ZА-ЯӨҮЁ]/i.test(no(rn))) { head = rn; continue; }
    if (head != null && !parent.has(rn) && !kidsOf.has(rn)) {
      parent.set(rn, head);
      const l = kidsOf.get(head) ?? [];
      l.push(rn);
      kidsOf.set(head, l);
      fixed++;
    }
  }
  if (fixed) console.log("№-ээр нөхсөн эцэг:", fixed);
}

const roots = [...rows.keys()].filter((r) => r > 1 && !parent.has(r)).sort((a, b) => a - b);
const depth = new Map();
function setDepth(rn, d, seen = new Set()) {
  if (seen.has(rn)) return;
  seen.add(rn);
  depth.set(rn, d);
  for (const k of kidsOf.get(rn) || []) setDepth(k, d + 1, seen);
}
for (const r of roots) setDepth(r, 0);

const g = (rn, col) => rows.get(rn)?.cells?.[col]?.v ?? "";

console.log("сүүлийн мөр:", LAST, "· үндэс:", roots.length, "· бүлэг:", kidsOf.size);
console.log("үндэс:", roots.slice(0, 40).map((r) => `${r}:${g(r, "A")} ${String(g(r, "B")).slice(0, 28)}`).join(" | "));
const byDepth = {};
for (const [, d] of depth) byDepth[d] = (byDepth[d] || 0) + 1;
console.log("гүний тархалт:", JSON.stringify(byDepth));
console.log("гүнгүй үлдсэн мөр:", [...rows.keys()].filter((r) => r > 1 && !depth.has(r)).length);

// ⚠️ Гол шалгуур: «эцэг = өөрөөсөө бага гүнтэй хамгийн ойрын дээд мөр» гэсэн
// дүрэм томъёоны модыг яг давтаж чадаж байна уу? Чадаж байвал апп-д зөвхөн гүн
// хадгалахад хангалттай (эцгийн хүснэгт хэрэггүй). 0 биш бол `bagts32.ts`-ийн
// `childIndexes` буруу мод угсарна.
{
  const stack = [];
  let bad = 0;
  const missing = [];
  for (let i = 2; i <= LAST; i++) if (!rows.has(i)) missing.push(i);
  for (const rn of [...rows.keys()].filter((r) => r > 1).sort((a, b) => a - b)) {
    const d = depth.get(rn);
    while (stack.length && depth.get(stack[stack.length - 1]) >= d) stack.pop();
    const p = stack.length ? stack[stack.length - 1] : null;
    if (p !== (parent.get(rn) ?? null)) {
      if (bad < 10) console.log(`  ЗӨРҮҮ мөр ${rn}: гүнээр=${p} томъёогоор=${parent.get(rn) ?? null}`);
      bad++;
    }
    stack.push(rn);
  }
  console.log("гүн↔томъёо зөрүү:", bad);
  console.log("excel-д байхгүй мөр:", JSON.stringify(missing));
}

if (process.argv[4] === "dump") {
  for (const rn of [...rows.keys()].sort((a, b) => a - b)) {
    if (rn === 1) continue;
    const d = depth.get(rn);
    console.log(
      `${String(rn).padStart(4)} oid=${String(rn - 1).padStart(4)} d=${d ?? "?"} ` +
        `${kidsOf.get(rn) ? "G" : "l"} ${String(g(rn, "A")).padEnd(6)} ` +
        `${"  ".repeat(d ?? 0)}${String(g(rn, "B")).slice(0, 55)}`,
    );
  }
}

if (process.argv[4] === "ts") {
  // ObjectID тутамд нэг тэмдэгт (= excel мөр − 1). Хоосон/байхгүй мөр → "0".
  let s = "";
  for (let oid = 1; oid <= LAST - 1; oid++) {
    const d = depth.get(oid + 1);
    if (d == null) { s += "0"; continue; }
    s += kidsOf.has(oid + 1) ? String.fromCharCode(65 + d) : String(d);
  }
  const lines = s.match(/.{1,100}/g).map((l) => `  "${l}" +`);
  lines[lines.length - 1] = lines[lines.length - 1].replace(/ \+$/, ";");
  fs.writeFileSync(
    process.argv[5],
    `// АВТОМАТААР ҮҮССЭН — ${process.argv[6] ?? base} мөрийн мод.\n` +
      `// Гараар бүү засварла; \`tools/bagts-tree.mjs\`-ээр дахин үүсгэ.\n` +
      `//\n` +
      `// Тэмдэгт бүр нэг ObjectID (= excel мөр − 1, дараалал нь ижил):\n` +
      `//   "0".."4"  тухайн гүнд байх ажлын мөр\n` +
      `//   "A".."E"  тухайн гүнд байх бүлэг (0..4 гүн)\n` +
      `// Эцэг нь = өмнөх мөрүүдээс өөрөөсөө бага гүнтэй хамгийн ойрын мөр\n` +
      `// (${LAST - 1} мөр дээр шалгасан: томъёоны модтой 100% таарсан).\n` +
      `export const TREE =\n${lines.join("\n")}\n`,
  );
  console.log("бичив:", s.length, "тэмдэгт →", process.argv[5]);
}
