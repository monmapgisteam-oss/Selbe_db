/**
 * ЧАНАРЫН БАРИМТЫН ЗАГВАРУУД — MIR · FIC шалгах мөрүүд, MS-ийн ажлын төрөл, MA ангилал.
 *
 * ЭХ СУРВАЛЖ (2026-09-28, `docs/chanar`):
 *   · MIR 8 мөр — Багц 1-ийн «Материалын үзлэг шалгалтын хуудас»
 *     (`SCM-SLB-MIR-0001-00.pdf`, скан); Багц 6.2-ийн хос хэлт 7 мөр (2-р загвар).
 *   · FIC 3 маягт — `docs/chanar/FIC/FIC/*.docx` (бетон · худаг · цахилгаан);
 *     загвар бүрд хавсралтын өөр олонлог, худагт «Гүйцэтгэл» хэсэг ҮГҮЙ.
 *   · MS 32 ажлын төрөл, 25 «шаардана» — «Ажлын аргачлал жагсаалт.pdf»; 6 бүлэг.
 *   · MA 6 ангилал × шаардлагатай материалын тоо (126) — бүртгэлийн KPI хуудас.
 *
 * ⚠️ 2026-09-28: МӨРИЙН ТЕКСТ МАЯГТААС ҮГЧЛЭН — маягтын дугаарлалт алдаатай
 *    (бетон: 6·7·8 хоёр удаа, 13–15 давхар; цахилгаан: 6·7 давтагдсан) тул
 *    энд `no` нь дараалсан 1…N, харин `section` нь маягтын бүлгийн гарчиг.
 *    Текстийг «засах» гэж бүү оролд — хэрэглэгч цаасан маягттайгаа тулгана.
 * ⚠️ ЦЭВЭР МОДУЛЬ: React үгүй, сүлжээ үгүй — `chanarTemplates.check.mjs`
 *    Node дээр ачаална. Текст `tr()`-ээр ЗУРАГДАХ агшинд (функцүүд) —
 *    модулийн түвшинд дуудвал хэл солиход хоцорно (`caps.ts`-ийн ⚠️).
 */

import { t as tr } from '@/lib/i18nCore';
import type { InspAttachKey, InspItem, InspKind } from './chanarMs';

/** Загварын мөр — `InspItem`-ийн хоосон утгатай хувилбар */
const row = (no: number, text: string, section: string | null): InspItem =>
  ({ no, text, section, contractor: null, client: null, comment: '' });

const rows = (section: string | null, texts: string[], start: number): InspItem[] =>
  texts.map((t, i) => row(start + i, t, section));

/* ════════════════════════ MIR ════════════════════════ */

/** MIR — Багц 1-ийн маягтын 8 мөр (2-р мөр MA-г иш татна) */
export function mirTemplate(): InspItem[] {
  return rows(null, [
    tr('Зураг төсөлтэй таарч буй эсэх'),
    tr('Материал баталгаажуулалт хийгдсэн эсэх'),
    tr('Баталгаажуулсан нийлүүлэгч байгууллага зөрөөгүй'),
    tr('Цэвэрхэн/ хэвийн эсэх'),
    tr('Горимын дагуу хадгалсан болон хамгаалагдсан эсэх'),
    tr('Лабораторийн туршилтын дүнг хавсаргасан эсэх'),
    tr('Стандартад заасан хэмжээ, хүлцэх хэмжээндээ байгаа эсэх'),
    tr('Гэмтэлгүй эсэх'),
  ], 1);
}

/**
 * MIR — Багц 6.2-ийн «Материалын үзлэгийн тайлан» (хос хэл) 7 мөр, өөр дараалал;
 * 7-р мөр батлагдсан MA-г иш татна (тайлбарт MA дугаар). 2026-09-28 тулгалт №4.
 */
export function mirTemplate62(): InspItem[] {
  return rows(null, [
    tr('Гэмтэлгүй эсэх'),
    tr('Зураг төсөлтэй таарч буй эсэх'),
    tr('Цэвэрхэн/ хэвийн эсэх'),
    tr('Горимын дагуу хадгалсан болон хамгаалагдсан эсэх'),
    tr('Лабораторын туршилтын дүнг хавсаргасан эсэх'),
    tr('Стандартад заасан хэмжээ хангагдаж буй эсэх'),
    tr('Батлагдсан материал баталгаажуулалтын дагуу эсэх'),
  ], 1);
}

/* ════════════════════════ FIC ════════════════════════ */

export type FicTemplateKey = 'concrete' | 'manhole' | 'electrical';
export const FIC_TEMPLATE_KEYS: readonly FicTemplateKey[] = ['concrete', 'manhole', 'electrical'];
export type MirTemplateKey = 'mir1' | 'mir62';
export const MIR_TEMPLATE_KEYS: readonly MirTemplateKey[] = ['mir1', 'mir62'];
export type InspTemplateKey = FicTemplateKey | MirTemplateKey;

/**
 * Загвар — мөрүүд + маягт бүрийн ялгаа (2026-09-28):
 *   attachments — маягтын хавсралтын чекбоксууд (MIR: лаборатори · гэрчилгээ · фото ·
 *     бусад; бетон FIC: геодези · шоо · фото · бусад; цахилгаан: геодези · фото · бусад;
 *     худаг: бусад)
 *   hasQuantity — «Гүйцэтгэл» (тоо хэмжээ) хэсэг байгаа эсэх (худаг FIC-д ҮГҮЙ)
 * `InspBody.template`-д `key` хадгалагдана; UI үүгээр хавсралт/хэсгийг зурна.
 */
export type InspTemplate = {
  key: InspTemplateKey; title: string; items: InspItem[];
  attachments: InspAttachKey[]; hasQuantity: boolean;
};

/** FIC загварын нэр — баримтын анхдагч `title` */
export function ficTemplateTitle(key: FicTemplateKey): string {
  if (key === 'concrete') return tr('Бетон цутгалтын дараах үзлэг');
  if (key === 'manhole') return tr('Худаг угсралт');
  return tr('Цахилгаан холбоо дохиолол');
}

/** «Бетон цутгалтын дараах үзлэг шалгалт хуудас» — 23 мөр + арчилгаа 6 = 29 */
function ficConcrete(): InspItem[] {
  const a = rows(tr('ТӨМӨР БЕТОН ХИЙЦЛЭЛ'), [
    tr('Бетон цутгалт авах үеийн бүртгэл /зуурмагийн сертификат, материлын хяналт хийсэн/'),
    tr('Төмөр бетон хийцлэлийн гадаргуу жигд, нягт болсон'),
    tr('Босоо, хэвтээ хийцлэлийн хүлцэх алдаа'),
    tr('Ан цав, хагарал үүсээгүй'),
    tr('Усалгаа, хамгаалалтын арга хэмжээ авч байгаа эсэх'),
    tr('Туршилтын сорьц (куб/цилиндр) авсан, бүртгэлтэй'),
    tr('Хучилтын түвшин хүлцэх алдаанаас хэтрээгүй'),
    tr('Бетон цутгалт авахаас өмнө геодизийн инженер хэмжилт хийсэн эсэх'),
  ], 1);
  const b = rows(tr('ХЭВ ХАШМАЛ'), [
    tr('Хэв хашмалын босоо хэвтээ хүлцэх алдаа'),
    tr('Хэв хашмал буулгах хугацааны шаардлага мөрдөгдөж байгаа эсэх'),
    tr('Батлагдсан ажлын аргачлалын дагуу гүйцэтгэсэн эсэх,'),
  ], a.length + 1);
  const c = rows(tr('БАРИМТ БИЧИГ /далд хийцийн ажил/'), [
    tr('Ханын арматурчлалын ажлын акт'),
    tr('Шатны арматурчлалын ажлын акт'),
    tr('Дам нуруу, баганын арматурчлалын акт'),
    tr('Хучилтын арматурчлалын акт'),
    tr('Бетон цутгалтын акт'),
    tr('Хэв хашмал угсарсан акт'),
    tr('Геодезийн хэмжилт хийж тэнхлэг зөөсөн тухай акт'),
    tr('Фото тайлан /зуурмагийн үзүүлэлт шалгасан, үе шатны ажилбар бүр дээр авсан самбартай зураг/'),
    tr('Ажилбар бүр дээр захиалагчийн Хяналтын инженер хянасан тухай бүртгэл'),
  ], a.length + b.length + 1);
  const d = rows(tr('НЭМЭЛТ АЖЛУУД'), [
    tr('Талбайг цэвэрлэсэн'),
    tr('Бетон цутгалтын үед гарсан алдааг хэрхэн засварласан'),
    tr('Засвар, нөхөөс хийгдэж дууссан'),
  ], a.length + b.length + c.length + 1);
  /* Маягтын 2-р хэсэг «АРЧИЛГАА ХИЙСЭН МЭДЭЭЛЭЛ» — арга (уур · гялгар хуудас ·
     услах · хучих · халаах · бусад) нь `remarks`-д текстээр; шалгах 6 мөр энд */
  const e = rows(tr('АРЧИЛГАА ХИЙСЭН МЭДЭЭЛЭЛ'), [
    tr('Шахалтын бат бэх'),
    tr('Цаг агаар шалгасан'),
    tr('Бетон арчилгааны аргачлал зөв'),
    tr('Арчилгааны хугацаа тохирсон'),
    tr('Бэхжүүлэгч, хөрсжүүлэгч хэрэглэсэн'),
    tr('Бетон арчилгаа зөв хийгдсэн'),
  ], a.length + b.length + c.length + d.length + 1);
  return [...a, ...b, ...c, ...d, ...e];
}

/** «Худаг угсралтын үзлэгийн хуудас» — 13 мөр */
function ficManhole(): InspItem[] {
  return rows(tr('ҮЗЛЭГ БА МЕХАНИК ШАЛГАЛТ'), [
    tr('Ухалтын ажил бүрэн дууссан.'),
    tr('Суурийн шалгалт'),
    tr('Чиглэл,байршил шалгах'),
    tr('Битүүмжилж , чигжсэн, ан цавгүй'),
    tr('Гадаргууг бэлтгэж дууссан бөгөөд праймер түрхсэн'),
    tr('Орох гарах хоолойн түвшин зурагт заасны дагуу байна.'),
    tr('Худагны дээд түвшний өндрийн шалгалт'),
    tr('Ойр орчны газар нягтруулсан, нэмэлт суултгүй'),
    tr('Цэвэрлэж, түр таг суурилуулсан'),
    tr('Худагны таг нэрийн пайзтайгаар суурилуулж ,битүүмжилсэн'),
    tr('Хоолойн нэвтрэлтүүд зөв байрлалтай'),
    tr('Бүх нэмэлт тоног төхөөрөмжүүд зөв байрлалтай. / Хаалт хашил, таг /'),
    tr('Үйлдвэрлэгчийн мэдээлэл бүрэн'),
  ], 1);
}

/** «Цахилгаан холбоо дохиололын үзлэг шалгалтын хуудас» — 10 мөр */
function ficElectrical(): InspItem[] {
  return rows(null, [
    tr('Цахилгаан, холбооны 20мм2 хар хоолой суурилуулах.'),
    tr('Цахилгааны хроп суурилуулалт'),
    tr('Самбарын нүхний гаргалгаа, түвшин'),
    tr('Цахилгааны хоолой холболт'),
    tr('Цахилгааны хоолой болох хроп хамгаалалт'),
    tr('Хүрээ газардуулгын гадас суурилуулалт'),
    tr('Хүрээ газардуулгын туузан төмөр таталт, хамгаалалт'),
    tr('Газардуулгын гагнуур, цэвэрлэгээ хамгаалалт/түрхлэг/'),
    tr('Хүчит төхөөрөмжийн хропний түвшин.'),
    tr('Барилгын арматурчлалын газардуулга, гаргалгаа'),
  ], 1);
}

/** FIC-ийн 3 загвар — зохиогч нэгийг сонгоод мөр нэмж/хасч болно */
export function ficTemplates(): InspTemplate[] {
  return [
    { key: 'concrete', title: ficTemplateTitle('concrete'), items: ficConcrete(), attachments: ['survey', 'cubes', 'photo', 'other'], hasQuantity: true },
    { key: 'manhole', title: ficTemplateTitle('manhole'), items: ficManhole(), attachments: ['other'], hasQuantity: false },
    { key: 'electrical', title: ficTemplateTitle('electrical'), items: ficElectrical(), attachments: ['survey', 'photo', 'other'], hasQuantity: true },
  ];
}

/** MIR-ийн 2 загвар — Багц 1 (8 мөр) · Багц 6.2 хос хэл (7 мөр) */
export function mirTemplates(): InspTemplate[] {
  const att: InspAttachKey[] = ['labTest', 'qualityCert', 'photo', 'other'];
  return [
    { key: 'mir1', title: tr('Материалын үзлэг'), items: mirTemplate(), attachments: att, hasQuantity: true },
    { key: 'mir62', title: tr('Материалын үзлэгийн тайлан (хос хэл, Багц 6.2)'), items: mirTemplate62(), attachments: att, hasQuantity: true },
  ];
}

/** Төрлөөр — MIR хоёр загвар, FIC гурав */
export function inspTemplates(kind: InspKind): InspTemplate[] {
  return kind === 'MIR' ? mirTemplates() : ficTemplates();
}

/** Загвар түлхүүрээр — танихгүй/хоосон бол тухайн төрлийн ЭХНИЙ загвар (хуучин мөр) */
export function inspTemplateOf(kind: InspKind, key: string | null | undefined): InspTemplate {
  const all = inspTemplates(kind);
  return all.find((t) => t.key === key) ?? all[0];
}

/** Шалгах мөрийн баганын нэр — «Шалгах» (MIR) / «Зүйл» (FIC); тайлбар «Тайлбар» */
export const inspItemColLabel = (kind: InspKind): string => (kind === 'MIR' ? tr('Шалгах') : tr('Зүйл'));
export const inspCommentColLabel = (): string => tr('Тайлбар');

/* ════════════════════════ MS — ажлын төрөл ════════════════════════ */

/** MS ажлын бүлэг — 6 ангилал (бүртгэлийн хураангуй, 2026-09-28) */
export const MS_GROUPS = ['bua', 'gadnaTsahilgaan', 'hd', 'has', 'gadnaShugam', 'uzel'] as const;
export type MsGroup = (typeof MS_GROUPS)[number];
export function msGroupLabel(g: MsGroup): string {
  if (g === 'bua') return tr('БУА');
  if (g === 'gadnaTsahilgaan') return tr('Гадна цахилгаан');
  if (g === 'hd') return tr('Гадна болон дотор ХД');
  if (g === 'has') return tr('Дотор ХАС, ЦБУ');
  if (g === 'gadnaShugam') return tr('Гадна шугам сүлжээ');
  return tr('Узель');
}

export type MsWorkType = { id: string; name: string; required: boolean; group: MsGroup };

/**
 * «Барилга угсралтын үе шатны ажлууд» — 32 төрөл; `required` = «шаардана»
 * (25), `false` = «үгүй» (7: өрлөг · шилэн фасад · металл фасад · дээвэр ·
 * керамик · чулуун хавтан · паркет).
 * ⚠️ `id` нь тогтмол (`w01`…`w32`) — `body.meta.workType`-д ЭНЭ хадгалагдана,
 *    нэр биш: нэр орчуулагддаг, засагддаг.
 * ⚠️ 2026-09-28 тулгалт: PDF-ийн «үгүй» = №4·7·8·9·10·11·14 (урьд №6·12·13·18
 *    буруу «үгүй» байсныг зассан). `group` — бүртгэлийн 6 бүлэг (БУА 8 · Гадна
 *    цахилгаан 4 · ХД 3 · ХАС/ЦБУ 3 · Гадна шугам 4 · Узель 3 = шаардлагатай 25) —
 *    бүртгэлд жагсаалт үгүй тул ажлын НЭРЭЭР логикоор хуваарилав; тоо таарна.
 */
export function msWorkTypes(): MsWorkType[] {
  const L: [string, boolean, MsGroup][] = [
    [tr('Газар шорооны ажил'), true, 'bua'],
    [tr('Төмөр бетон бүтээц буюу каркас, бүрэн цутгамал хийцлэлийн ажил'), true, 'bua'],
    [tr('Суурь болон зоорийн ханын ус тусгаарлалт дулаалгын ажил'), true, 'bua'],
    [tr('Өрлөгийн ажил'), false, 'bua'],
    [tr('Хуванцар хүрээтэй цонх болон шилэн хаалга, хаалтын ажил'), true, 'bua'],
    [tr('Хаалга суурилуулах ажил'), true, 'bua'],
    [tr('Шилэн фасадын ажил'), false, 'bua'],
    [tr('Металл фасадын ажил'), false, 'bua'],
    [tr('Дээврийн ажил'), false, 'bua'],
    [tr('Хана шалны керамик хавтанцар суурилуулах ажил'), false, 'bua'],
    [tr('Тагт ба дотор хэсгийн чулуун хавтан шал, ханын ажил'), false, 'bua'],
    [tr('Дотор заслын ажил'), true, 'bua'],
    [tr('Бетон шалны тэгшилгээний ажил'), true, 'bua'],
    [tr('Паркетан шал суурилуулах ажил'), false, 'bua'],
    [tr('Барилгын дотор цахилгааны угсралтын ажил'), true, 'has'],
    [tr('Газардуулга, аянга байгуулалтын ажил'), true, 'gadnaTsahilgaan'],
    [tr('Галын дохиоллын систем суурилуулах'), true, 'hd'],
    [tr('Дотор холбоо, дохиоллын ажил'), true, 'hd'],
    [tr('Дотор халаалт (холигч насосны зангилаа), Агаар сэлгэлтийн системийн угсралтын ажил (ХАС)'), true, 'has'],
    [tr('Дотор ус хангамжийн систем (ЦБУ, Галын ус хангамжийн систем, Борооны ус зайлуулах)'), true, 'has'],
    [tr('Цахилгаан шатны угсралтын ажил /лифт/'), true, 'uzel'],
    [tr('Гадна цахилгааны ажил'), true, 'gadnaTsahilgaan'],
    [tr('Гадна холбооны ажил'), true, 'hd'],
    [tr('Дэд өртөө /ил хуваарилах байгууламж/'), true, 'gadnaTsahilgaan'],
    [tr('Хаалттай хуваарилах байгууламж иж бүрэн/ КТПН/, РП, АТП'), true, 'gadnaTsahilgaan'],
    [tr('Гадна ариутгах татуургын системийн ажил'), true, 'gadnaShugam'],
    [tr('Гадна дулаан, халуун, хүйтэн ус хангамжийн системийн ажил'), true, 'gadnaShugam'],
    [tr('Ус хангамжийн 1-р хэлхээний шугам (эх үүсвэр ба цагирган шугам)-ын ажил'), true, 'gadnaShugam'],
    [tr('Хөрсний усны шүүрүүлийн байгууламж болон зайлуулах шугам сүлжээний ажил'), true, 'gadnaShugam'],
    [tr('Дулаан механикийн ажил, (Дулаан хуваарилах төв)'), true, 'uzel'],
    [tr('Буулгалтын ажлын аргачлал (Гадна ариутгах татуургын систем)'), true, 'uzel'],
    [tr('Өндөржилтийн ажил'), true, 'bua'],
  ];
  return L.map(([name, required, group], i) => ({ id: `w${String(i + 1).padStart(2, '0')}`, name, required, group }));
}

/** Шаардлагатай 25 аргачлалын `id` — багцын хураангуйд «25-аас N батлагдсан» */
export const msRequiredIds = (): string[] =>
  msWorkTypes().filter((w) => w.required).map((w) => w.id);

/** Ажлын төрлийн нэр — `id`-аас; танихгүй бол `id` хэвээр */
export const msWorkTypeName = (id: string | null | undefined): string =>
  msWorkTypes().find((w) => w.id === id)?.name ?? (id ?? '');

export type MsGroupProgress = { submitted: number; approved: number; total: number; missing: string[] };

/**
 * Багцын MS хураангуй — шаардлагатай төрлүүдээс хэд нь ИРҮҮЛСЭН (ноорогоос
 * бусад төлөв) / БАТЛАГДСАН MS-тэй; бүлгээр ч (2026-09-28).
 * `docs` нь `{ status, workType }` — `chanarStore.loadDocs('MS')` + бие дэх
 * `meta.workType` (жагсаалтад бие байхгүй тул дуудагч цуглуулна).
 * `draftStatus` өгөөгүй бол «ирүүлсэн» = бүх төлөв (ноорог ч).
 */
export function msRequiredProgress(
  docs: readonly { status: string; workType: string | null }[],
  approvedStatus: string,
  draftStatus?: string,
): MsGroupProgress & { byGroup: Record<MsGroup, MsGroupProgress> } {
  const types = msWorkTypes().filter((w) => w.required);
  const done = new Set(docs.filter((d) => d.status === approvedStatus && d.workType).map((d) => d.workType as string));
  const sent = new Set(docs.filter((d) => d.workType && d.status !== draftStatus).map((d) => d.workType as string));
  const empty = (): MsGroupProgress => ({ submitted: 0, approved: 0, total: 0, missing: [] });
  const byGroup = Object.fromEntries(MS_GROUPS.map((g) => [g, empty()])) as Record<MsGroup, MsGroupProgress>;
  const all = empty();
  for (const w of types) {
    for (const p of [all, byGroup[w.group]]) {
      p.total += 1;
      if (done.has(w.id)) p.approved += 1; else p.missing.push(w.id);
      if (sent.has(w.id)) p.submitted += 1;
    }
  }
  return { ...all, byGroup };
}

/* ════════════════════════ MA — ангилал, шаардлагатай тоо ════════════════════════ */

/**
 * MA-ийн 6 ангилал — бүртгэлийн KPI хуудас (126 материал): БУА 27 · Цахилгаан 22 ·
 * Гадна, дотор ХД 32 · Дотор ХАС, ЦБУ 26 · Гадна шугам сүлжээ 13 · Узель 6.
 * ⚠️ Жагсаалт байхгүй, ЗӨВХӨН ТОО — тоолол нь батлагдсан баримтын материалын
 *    мөрөөр (`chanarUi.maMaterialSummary`). `body.meta.category`-д `id` хадгалагдана.
 */
export const MA_CATEGORIES = ['bua', 'tsahilgaan', 'hd', 'has', 'gadnaShugam', 'uzel'] as const;
export type MaCategory = (typeof MA_CATEGORIES)[number];
export const MA_REQUIRED: Readonly<Record<MaCategory, number>> = { bua: 27, tsahilgaan: 22, hd: 32, has: 26, gadnaShugam: 13, uzel: 6 };
export const isMaCategory = (x: unknown): x is MaCategory =>
  typeof x === 'string' && (MA_CATEGORIES as readonly string[]).includes(x);
export function maCategoryLabel(c: MaCategory | string): string {
  if (c === 'bua') return tr('БУА');
  if (c === 'tsahilgaan') return tr('Цахилгаан');
  if (c === 'hd') return tr('Гадна, дотор ХД');
  if (c === 'has') return tr('Дотор ХАС, ЦБУ');
  if (c === 'gadnaShugam') return tr('Гадна шугам сүлжээ');
  if (c === 'uzel') return tr('Узель');
  return c;
}
