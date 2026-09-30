import type { SheetRow } from '@/modules/sheet/bagtsSheet';
import type { Pkg, Schema } from '@/modules/sheet/bagts.pkg';
import type { PlanRow } from '@/lib/plan';
import {
  balanced, buildEdits, obyemResFields, sumRes, type MonthRes, type PkgPlan, type PkgRes, type PlanEdits, type WorkMeta,
} from '@/lib/huvaariObyem';
import type { ADraft, Draft, PlanKind, ResDraft } from './types';
import { obKey } from './util';

/**
 * ХАДГАЛАЛТЫН БЭЛТГЭЛ — ноорогоос `applyUpdates`-ийн мөрүүд (`upd`) ба сарын
 * задаргааны засварууд (`obEdits`) (2026-09-30: `Huvaari.tsx`-ийн `save`-ийн
 * бэлтгэх хагасыг механикаар салгав — ЮУ Ч БИЧИХГҮЙ, зөвхөн тооцоолно; бичилт ·
 * мэдэгдэл · ноорог цэвэрлэлт `save` дотор хэвээр). Дүрмийн ⚠️ тайлбарууд ХЭВЭЭР.
 *
 * ⚠️ `stale > 0` бол ноорогийн OID одоогийн агшинд олдсонгүй — `save` татгалзана.
 */
export type SavePrep = {
  ok: true;
  upd: Record<string, unknown>[];
  obEdits: PlanEdits | null;
  /** Нийлбэр нь нийт обьёмтой тэнцээгүй тул бичигдээгүй (ажил·блок) */
  unbal: number;
  unbalKeys: Set<string>;
  resSkipped: number;
  resSkippedKeys: Set<string>;
  resDropped: number;
  rfUnknown: boolean;
  obLost: number;
} | { ok: false; stale: number };

export async function prepareSave({
  sc, kind, pkg, rows, base, draft, ham, aDraft, resDraft, obDraft, obResDraft, obPlan, obRes, obOids,
}: {
  sc: Schema; kind: PlanKind; pkg: Pkg; rows: SheetRow[]; base: PlanRow[];
  draft: Draft; ham: Map<number, string>; aDraft: ADraft; resDraft: ResDraft;
  obDraft: Map<string, Map<string, number>>; obResDraft: Map<string, Map<string, MonthRes>>;
  obPlan: PkgPlan; obRes: PkgRes; obOids: Map<string, number>;
}): Promise<SavePrep> {
  const byOid = new Map(rows.map((r) => [r.oid, r]));
  /**
   * ⚠️ НООРОГИЙН OID нь ОДООГИЙН агшинд ОЛДОХГҮЙ БАЙВАЛ (2026-09-08).
   *
   * Батлах урсгалд илгээлтийн `payload` нь ИЛГЭЭСЭН ҮЕИЙН OBJECTID-аар
   * түлхүүрлэгддэг. Хооронд нь «Гүйцэтгэл бөглөх» нийтлэгдвэл архивт
   * бүтэн шинэ хуулбар нэмэгдэж БҮХ OID солигдоно. Тэр үед батлагчийн
   * `rows` ба доорх `fresh` ХОЁУЛАА ШИНЭ агшных тул доорх `rows[0].oid`-ийн
   * харьцуулалт ХУДАЛ гарч, зөөлт огт ажиллахгүй байв: мөр бүр чимээгүй
   * алгасагдаж, `upd` хоосон болж, «Өөрчлөлт олдсонгүй» гэж АМЖИЛТ мэт
   * харагдаад дээрх `useEffect` илгээлтийг `approved` болгодог байв —
   * гүйцэтгэгчийн олон зуун мөр ул мөргүй алга болно.
   *
   * ⚠️ ХУУЧИН OID-оос ажлын мөрийг СЭРГЭЭХ БОЛОМЖГҮЙ: `payload` нь
   *    зөвхөн OID агуулна, (№ + ажлын нэр) нь `rows`-оос л гардаг тул
   *    OID нь тэнд байхгүй бол зөөх түлхүүр алга. Тиймээс ЧИМЭЭГҮЙ
   *    алгасахын оронд ИЛ ТАТГАЛЗАНА — ноорог хэвээр үлдэж, `dirtyN`
   *    тэглэгдэхгүй тул илгээлт `approved` болохгүй.
   */
  const staleN = [...new Set([...draft.keys(), ...ham.keys(), ...aDraft.keys(), ...resDraft.keys()])]
    .filter((oid) => !byOid.has(oid)).length;
  if (staleN) return { ok: false, stale: staleN };
  const upd: Record<string, unknown>[] = [];
  for (const [oid, spans] of draft) {
    const orig = byOid.get(oid);
    if (!orig) continue;
    const a: Record<string, unknown> = { [sc.f.oid]: oid };
    let changed = 0;
    spans.forEach((s, b) => {
      /* ⚠️ Талбар байхгүй блок бий (эх хуудасны толгой эвдэрсэн) — тэнд
         бичих газаргүй тул АЛГАСНА, унахгүй. */
      /* ⚠️ ТӨРӨЛ бүрд ӨӨР талбар (2026-09-11). `kind` нь хадгалах
         агшинд уншигдана — ноорог нь солигдоход цэвэрлэгддэг тул
         өөр төрлийн ноорог энд хүрэх боломжгүй. */
      const fStart = kind === 'geree' ? sc.gStart[b] : sc.start[b];
      const fEnd = kind === 'geree' ? sc.gEnd[b] : sc.end[b];
      if (!fStart && !fEnd) return;
      const ns = s ? s.start : null;
      const ne = s ? s.end : null;
      /**
       * ⚠️ ЗӨВХӨН ӨӨРЧЛӨГДСӨН БЛОКИЙГ бичнэ.
       *
       * Урьд нь ноорогтой мөрийн БҮХ блокийг бичдэг байв. `toPlanRows`-д
       * муж нь эхлэх БА дуусах хоёулаа байж л үүсдэг тул ЗӨВХӨН эхлэх
       * огноотой (эсвэл зөвхөн дуусахтай) хагас бөглөсөн блок нь `null`
       * муж болж, хадгалахад тэр огноо ЧИМЭЭГҮЙ УСТДАГ байлаа — өөр
       * блокт нэг зурвас чирсний төлөө.
       */
      const os = kind === 'geree' ? orig.gStart[b] : orig.start[b];
      const oe = kind === 'geree' ? orig.gEnd[b] : orig.end[b];
      if (ns === os && ne === oe) return;
      /*
       * ⚠️ ХАГАС БӨГЛӨСӨН БЛОКИЙГ ХӨНДӨХГҮЙ (2026-09-11-ний аудит, хэмжсэн).
       *    Дээрх тайлбар «зөвхөн өөрчлөгдсөн блокийг» гэж бичсэн ч эх мөрд
       *    ЗӨВХӨН эхлэх (эсвэл зөвхөн дуусах) огноотой блок нь `toPlanRows`-д
       *    `null` муж болдог тул ноорогт `null` хэвээр орж, диффд `null ≠
       *    огноо` гарч, тэр огноо `null` болж БИЧИГДДЭГ байв — хэрэглэгч
       *    өөр блокт зурвас чирсний төлөө. Ноорог `null` БА эх мөр хагас
       *    бол хэрэглэгч ЭНЭ блокийг хөндөөгүй гэсэн үг: алгасна.
       *    Хэрэглэгч блокийг ЗОРИУД цэвэрлэвэл `commit(oid, null)` явдаг ч
       *    тэр нь эх нь БҮТЭН (`os && oe`) байсан үед л ялгаатай — хагас
       *    эхийг цэвэрлэх боломж алдагдана, гэхдээ огноо устахаас дээр.
       */
      if (s === null && (os != null) !== (oe != null)) return;
      if (fStart) a[fStart] = ns;
      if (fEnd) a[fEnd] = ne;
      changed += 1;
    });
    if (changed) upd.push(a);
  }
  /* УЯЛДААНЫ НООРОГ — огнооны бичилттэй нэг мөрөнд нийлүүлнэ. Хоосон
     текст нь `null` болж талбарыг цэвэрлэнэ (хоосон мөр хадгалахгүй). */
  if (sc.f.ham) {
    for (const [oid, text] of ham) {
      const orig = byOid.get(oid);
      if (!orig) continue;
      const v = text.trim() || null;
      if ((orig.ham ?? null) === v) continue;
      const ex = upd.find((u) => u[sc.f.oid] === oid);
      if (ex) ex[sc.f.ham] = v;
      else upd.push({ [sc.f.oid]: oid, [sc.f.ham]: v });
    }
  }
  /**
   * БОДИТ ОГНООНЫ НООРОГ (2026-09-23) — огнооны бичилттэй нэг мөрөнд.
   * ⚠️ ЗӨВХӨН ӨӨРЧЛӨГДСӨН БЛОКИЙГ — `draft`-ын ижил дүрэм; талбаргүй
   *    блокийг алгасна (унахгүй). `kind`-ээс ХАМААРАХГҮЙ: бодит талбар
   *    нэг л байна.
   * ⚠️ Хагас бүртгэл (эхэлсэн, дуусаагүй) ХЭВИЙН — `null`-г ч бичнэ
   *    (цэвэрлэх = «бүртгэлгүй» болгох), гэхдээ зөвхөн зөрсөн үед.
   */
  const upsert = (oid: number): Record<string, unknown> => {
    const ex = upd.find((u) => u[sc.f.oid] === oid);
    if (ex) return ex;
    const a: Record<string, unknown> = { [sc.f.oid]: oid };
    upd.push(a);
    return a;
  };
  for (const [oid, ad] of aDraft) {
    const orig = byOid.get(oid);
    if (!orig) continue;
    let changed = 0;
    const a: Record<string, unknown> = {};
    ad.start.forEach((ns, b) => {
      const ne = ad.end[b] ?? null;
      const os = orig.aStart[b] ?? null;
      const oe = orig.aEnd[b] ?? null;
      if (ns === os && ne === oe) return;
      if (sc.aStart[b]) { a[sc.aStart[b]!] = ns; changed += 1; }
      if (sc.aEnd[b]) { a[sc.aEnd[b]!] = ne; changed += 1; }
    });
    if (changed) Object.assign(upsert(oid), a);
  }
  /* ХҮН ХҮЧ · МАШИН МЕХАНИЗМ — талбар байвал, зөрсөн үед л (2026-09-23) */
  for (const [oid, rd] of resDraft) {
    const orig = byOid.get(oid);
    if (!orig) continue;
    const a: Record<string, unknown> = {};
    if (sc.f.hunHuch && (rd.hun ?? null) !== (orig.hun ?? null)) a[sc.f.hunHuch] = rd.hun;
    if (sc.f.mashin && (rd.mashin ?? null) !== (orig.mashin ?? null)) a[sc.f.mashin] = rd.mashin;
    if (Object.keys(a).length) Object.assign(upsert(oid), a);
  }
  /**
   * ⚠️ ЭРТ БУЦАЛТ нь ЗӨВХӨН огноо·уялдаа·ОБЬЁМ ГУРВУУЛАА хоосон үед
   *    (2026-09-08). Урьд нь зөвхөн `upd.length`-ыг шалгадаг байсан тул
   *    ЗӨВХӨН сарын обьёмоо зассан тохиолдолд («Тавих» дээр огноо
   *    хөндөөгүй) энд буцаж, обьём ХЭЗЭЭ Ч бичигддэггүй байв. Батлах
   *    урсгалд бүр ноцтой: `obDraft` цэвэрлэгдэхгүй тул `dirtyN > 0`
   *    үлдэж, «эх хуудсанд бичигдсэнгүй» гэж алдаа өгөөд илгээлт
   *    `pending` хэвээр гацдаг байлаа.
   * ⚠️ Ноорогийг `tookD`/`tookH`-ээр л цэвэрлэнэ — `new Map()` нь энэ
   *    async явцад орсон ШИНЭ засварыг ч хамт устгана.
   */
  /*
   * ── САРЫН ОБЬЁМ — засварыг ЭНД БЭЛТГЭНЭ, доор (огнооны дараа) БИЧНЭ ──
   * ⚠️ Бэлтгэл нь мөрийн нийлбэрээс ӨМНӨ (2026-09-24 аудит): тэнцээгүй
   *    (`unbalKeys`) буюу талбаргүй тул бичигдэхгүй блокийн нөөц мөрийн
   *    хүн/машинд орж, мөр нь сарын хүснэгттэй зөрдөг байв. Бичилт нь
   *    хуваарийн огноо бичигдсэний ДАРАА хэвээр (доорх `obEdits`).
   * ⚠️ Холбоос нь `Des_dugaar` — `ObjectID` БИШ. Тиймээс доорх агшин
   *    солигдох (`oidMap`) асуудал ЭНД хамаарахгүй: ажлын код нийтлэл
   *    бүрд тогтвортой.
   * ⚠️ Кодгүй мөрд задаргаа хадгалахгүй — холбох зүйлгүй.
   */
  /** Нийлбэр нь нийт обьёмтой тэнцээгүй тул бичигдээгүй (ажил·блок) */
  let unbal = 0;
  const unbalKeys = new Set<string>();
  /** Сарын нөөцийн талбар үйлчилгээнд АЛГА — бичигдээгүй (ажил·блок) (2026-09-24) */
  let resSkipped = 0;
  /* ⚠️ Бичигдээгүй нөөцийн түлхүүрүүд (2026-09-24 аудит) — `unbalKeys`-тэй адил
     ноорогт ҮЛДЭЭНЭ; урьд нь цэвэрлэгдэж, батлалт «бичигдлээ» гэж үргэлжилдэг байв. */
  const resSkippedKeys = new Set<string>();
  /** Мужаас ГАДУУРХ (обьёмгүй) сарын нөөц хаягдсан (ажил·блок) (2026-09-24 аудит) */
  let resDropped = 0;
  /** Талбарын шалгалт 2 удаа ч бүтсэнгүй → нөөц бичигдэхгүй (2026-09-24 аудит) */
  let rfUnknown = false;
  /** Ажил нь хуудсанд олдоогүй сарын ноорог (ажил·блок) — хаягдсан (2026-09-29 аудит) */
  let obLost = 0;
  const fields = { hun: false, mashin: false };
  let obEdits: PlanEdits | null = null;
  if (obDraft.size || obResDraft.size) {
    const byDes = new Map(base.map((r) => [r.des, r]));
    const all: PlanEdits = { adds: [], updates: [], deletes: [] };
    /* ⚠️ Талбарын шалгалт: `null` (мэдэхгүй) бол НЭГ удаа дахин оролдоно; мөн л
       мэдэхгүй бол БАЙХГҮЙ гэж үзнэ (2026-09-24 аудит) — урьд нь `null`-д
       бичихийг оролдож, талбаргүй үйлчилгээнд бүх мөр унадаг байв. */
    let rf = await obyemResFields();
    if (rf.hun == null || rf.mashin == null) rf = await obyemResFields();
    rfUnknown = rf.hun == null || rf.mashin == null;
    fields.hun = rf.hun === true; fields.mashin = rf.mashin === true;
    for (const key of new Set([...obDraft.keys(), ...obResDraft.keys()])) {
      const cut = key.indexOf("|");
      const des = Number(key.slice(0, cut));
      const blok = key.slice(cut + 1);
      const r = byDes.get(des);
      /* ⚠️ 2026-09-29 аудит: ажил хуудсанд олдохгүй (шинэ жаазанд код солигдсон/устсан)
         бол ЧИМЭЭГҮЙ алгасахгүй — тоолж доор ил хэлнэ; ноорог нь цэвэрлэгдэнэ. */
      if (!r || !blok) { obLost += 1; continue; }
      /* Обьёмын ноорог байхгүй бол СЕРВЕРИЙН задаргаан дээр нөөц л өөрчлөгдсөн */
      const months = obDraft.get(key) ?? obPlan.get(des)?.get(blok) ?? new Map<string, number>();
      /**
       * ⚠️ ТЭНЦЭЭГҮЙ ЗАДАРГААГ БИЧИХГҮЙ (2026-09-08).
       *
       * Popup-аар бөглөхөд `mvOk` шалгуур нийлбэрийг барьдаг ч ГИНЖЭЭР
       * (уялдаа, чирэлт) хуваарь шилжихэд popup нээгддэггүй: `keepMonths`
       * нь шинэ мужид ОРООГҮЙ саруудыг хаядаг тул нийлбэр чимээгүй
       * ЗАДАРНА (1000 → 500). Тэр задаргаа бичигдвэл `planPctFromMonths`
       * нь `done / sumMonths(m)` гэж САРУУДЫН НИЙЛБЭРТ хуваадаг учир
       * тайрагдсан задаргаа өөрийгөө 100% болгож нормчилно — S-муруй,
       * хоцрогдлын дохио бүгд ЧИМЭЭГҮЙ худал болно.
       *
       * ⚠️ ХАГАС задаргаа бичихээс ТАТГАЛЗАНА (`null ≠ 0`): бичихгүй
       *    орхивол хуучин бүтэн задаргаа хэвээр үлдэж, хүн дахин бөглөнө.
       *    Хоосон (бүх сар нь хоосон) задаргаа нь «арилгах» гэсэн
       *    санаатай үйлдэл тул үүнд хамаарахгүй.
       * ⚠️ Обьёмгүй мөрд (`vol` нь null/0) шалгах суурь алга — хэвээр.
       */
      if (months.size && r.vol != null && r.vol > 0 && !balanced(months, r.vol)) {
        unbal += 1;
        unbalKeys.add(key);
        continue;
      }
      /* ⚠️ Мужаас ГАДУУРХ сарын нөөцийг `buildEdits` чимээгүй хаядаг (обьёмгүй
         сард мөр байхгүй) — ЭНД хасаж тоолно, доор анхааруулна (2026-09-24 аудит). */
      let resCur = obResDraft.get(key);
      if (resCur) {
        const t = new Map<string, MonthRes>();
        let drop = 0;
        for (const [sar, v] of resCur) { if (months.has(sar)) t.set(sar, v); else drop += 1; }
        if (drop) { resDropped += 1; resCur = t; }
      }
      /* ⚠️ Талбар тус бүрээр (2026-09-24 аудит): байхгүй талбарт ноорог УТГАТАЙ
         байвал л тоолно — хоосон талбарт анхааруулдаг байв. */
      if (resCur) {
        let need = false;
        for (const v of resCur.values()) {
          if ((!fields.hun && v.hun != null) || (!fields.mashin && v.mashin != null)) { need = true; break; }
        }
        if (need) { resSkipped += 1; resSkippedKeys.add(key); }
      }
      const meta: WorkMeta = {
        bagts: pkg.key,
        bagtsNer: pkg.label,
        des,
        ajilNo: r.no,
        ajilNer: r.work,
        /* ⚠️ Нэгж нь ЭХ ӨГӨГДӨЛД БАЙХГҮЙ (`negj.ts` нь ажлын нэрнээс
           ТААМАГЛАДАГ бөгөөд «ямар ч тооцоонд хэрэглэхгүй» гэж
           баримтжуулсан). Таамгийг хүлээлгэж өгөх датад бичихгүй —
           жинхэнэ нэгж эх төсвөөс ирэх хүртэл хоосон. */
        negj: '',
        niit: r.vol,
      };
      const prev = obPlan.get(des)?.get(blok) ?? new Map<string, number>();
      const e = buildEdits(meta, blok, months, prev, obOids, resCur
        ? { cur: resCur, prev: obRes.get(des)?.get(blok) ?? new Map<string, MonthRes>(), fields }
        : undefined);
      all.adds.push(...e.adds);
      all.updates.push(...e.updates);
      all.deletes.push(...e.deletes);
    }
    obEdits = all;
  }
  /**
   * МӨРИЙН ХҮН/МАШИН = САРЫН НӨӨЦИЙН НИЙЛБЭР (2026-09-24, хэрэглэгчийн шийдвэр).
   * ⚠️ Сарын нөөцийг ХӨНДСӨН ажил бүрд бүх блок · бүх сарын `sumRes` — нэг ч
   *    сард утга байвал мөрийн талбарыг ДАРНА (`resDraft`-аас давамгайлна);
   *    сарын утга огт байхгүй бол дээрх мөрийн зам хэвээр. Нийлбэр нь
   *    хүн-сар/машин-сар гэсэн утгатай — хэрэглэгчид хэлсэн.
   * ⚠️ Дээрх бэлтгэлийн ДАРАА (2026-09-24 аудит): бичигдэхгүй блок
   *    (`unbalKeys`) серверийн утгаараа тоологдоно; байхгүй талбар
   *    (`fields`) мөрд ч бичигдэхгүй; мужаас гадуурх сар тоологдохгүй.
   *    Серверт нөөц байсан атлаа бүгд хоосорсон бол мөрийг `null` болгоно
   *    (арилгах санаатай) — урьд нь алгасаж хуучин нийлбэр үлддэг байв.
   */
  if (obResDraft.size) {
    const byDes = new Map(base.map((r) => [r.des, r]));
    const desSet = new Set<number>();
    for (const k of obResDraft.keys()) desSet.add(Number(k.slice(0, k.indexOf('|'))));
    for (const des of desSet) {
      const pr = byDes.get(des);
      const orig = pr ? byOid.get(pr.oid) : undefined;
      if (!pr || !orig || pr.group) continue;
      const all = new Map<string, MonthRes>();
      let written = 0;
      let hadSrv = false;
      for (const blok of sc.bld) {
        const key = obKey(des, blok);
        const srv = obRes.get(des)?.get(blok);
        if (srv?.size) hadSrv = true;
        const d = obResDraft.get(key);
        const use = d && !unbalKeys.has(key) ? d : srv;
        if (d && use === d) written += 1;
        if (!use) continue;
        /* ⚠️ Тэнцээгүй блок серверийн нөөцөөр тоологдох тул сар нь ч СЕРВЕРИЙН
           задаргаагаар (2026-09-24 аудит) — нооргийн саруудаар шүүвэл зөрнө. */
        const months = unbalKeys.has(key)
          ? obPlan.get(des)?.get(blok)
          : obDraft.get(key) ?? obPlan.get(des)?.get(blok);
        for (const [sar, v] of use) if (months?.has(sar)) all.set(`${blok}|${sar}`, v);
      }
      if (!written) continue;
      const sum = sumRes(all);
      if (sum.hun == null && sum.mashin == null && !hadSrv) continue;
      const a: Record<string, unknown> = {};
      if (sc.f.hunHuch && fields.hun && (sum.hun ?? null) !== (orig.hun ?? null)) a[sc.f.hunHuch] = sum.hun;
      if (sc.f.mashin && fields.mashin && (sum.mashin ?? null) !== (orig.mashin ?? null)) a[sc.f.mashin] = sum.mashin;
      if (Object.keys(a).length) Object.assign(upsert(pr.oid), a);
    }
  }

  return { ok: true, upd, obEdits, unbal, unbalKeys, resSkipped, resSkippedKeys, resDropped, rfUnknown, obLost };
}
