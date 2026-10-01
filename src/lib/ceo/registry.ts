/**
 * CEO-ГИЙН САМБАРЫН БҮРТГЭЛ — 13 үзүүлэлт, ачаалагч бүрийн заалт.
 *
 * ⚠️ 2026-09-06, хэрэглэгчийн жагсаалт (үг үгээр): обьёмын зөрүү ·
 * гүйцэтгэлийн зөрүү · IPC · гэрээлсэн ба урьдчилсан төсвийн зөрүү · нэгж
 * талбар/газар чөлөөлөлт · гүйцэтгэл бөглөх ба шийдвэрлэх хоцролт · ажлын
 * төлөвлөгөө/гүйцэтгэлийн хоцрогдол · чанарын хяналт pending · гүйцэтгэгч
 * шалгараагүй ажил/cashflow · ХАБ · хүн-цаг-техник (өмнөх өдрөөс хэлбэлзэл) ·
 * зөвшөөрөл pending · тохиромжтой байдлын үнэлгээ багцаар · IoT босго хэтрэлт.
 *
 * ⚠️ 14 → 13 КАРТ. «Гүйцэтгэлийн зөрүү» (төлөвлөсөн − бодит, пункт) ба
 * «төлөвлөгөө/гүйцэтгэлийн хоцрогдол» (хугацаагаар) хоёр нь НЭГ эх сурвалж
 * (`lagOf`) тул нэг картад — хоёр карт болговол нэг зүйлийн тухай хоёр өөр
 * тоо зэрэгцэн зогсоно (2026-09-06-нд яг энэ давхардлыг хэрэглэгч шүүмжилсэн).
 * Газар чөлөөлөлт ба нэгж талбарын давхцал мөн нэг карт (хэрэглэгч нэг мөрөөр
 * нэрлэсэн).
 *
 * ⚠️ БАЙРЛАЛЫГ ЭНД ТОДОРХОЙЛОХГҮЙ (2026-09-06, хэрэглэгч: «схем бүхэлдээ
 * харагдаад түрүүнд өгсөн листүүд тохирох картууд дээр ерөнхийд нь
 * харагдаад…»). Үзүүлэлт бүр ҮЙЛ АЖИЛЛАГААНЫ СХЕМИЙН зангилаан дээрээ сууна;
 * тэр зураглал нь `ceo/schemMap.ts`-д. Урьд нь энд сэдэвчилсэн дөрвөн бүлэг
 * (санхүү · хуваарь · саад · хүн) байсныг ХАСАВ — схемийн байрлал нь
 * «энэ тоо ЯМАР АЛХАМД гардаг вэ» гэдгийг бүлгээс хамаагүй сайн хэлнэ.
 *
 * ⚠️ ЯАГААД ТУСДАА ФАЙЛ ВЭ. Бүртгэл нь React-гүй цэвэр өгөгдөл тул
 * `registry.check.mjs` Node дээр шууд ачаалж «түлхүүр давхардаагүй, ачаалагч
 * файл байгаа, харагдацын түлхүүр зөв» гэдгийг шалгана.
 */
import { t as tr } from '@/lib/i18nCore';
import type { ViewKey } from '@/lib/services';
import type { KpiResult } from './kpi';
import { loadVarianceKpi } from './variance';
import { loadIpcKpi } from './ipc';
import { loadContractGapKpi } from './contractGap';
import { loadUncontractedKpi } from './uncontracted';
import { loadScheduleKpi } from './schedule';
import { loadReviewKpi } from './review';
import { loadLandKpi } from './land';
import { loadPermitsKpiSafe } from './permits';
import { loadQaqcKpi } from './qaqc';
import { loadSafetyKpi } from './safety';
import { loadWorkforceKpi } from './workforce';
import { loadSuitabilityKpi } from './suitability';
import { loadIotKpiSafe } from './iot';

export type CeoKpiDef = {
  key: string;
  /**
   * Дэлгэрэнгүйн гарчиг — НЭГ мөр.
   * ⚠️ Схемийн зангилааны нэрнээс ӨӨР байж болно: зангилаа нь АЖИЛЛАГААГ
   *    («Гэрээний дүн»), үзүүлэлт нь ХЭМЖИЛТИЙГ («Гэрээ ба төсвийн зөрүү»)
   *    нэрлэнэ. Нэг зангилаанд хоёр үзүүлэлт байх үед энэ ялгаа заавал хэрэгтэй.
   */
  title: string;
  icon: string;
  /** Дэлгэрэнгүйгээс очих харагдац */
  view: ViewKey;
  load: () => Promise<KpiResult>;
  /**
   * ХҮНД ачаалагч — олон хүснэгт/геометр татдаг. Хөнгөн картууд эхэлж
   * зурагдсаны дараа, хөтөч чөлөөтэй болмогц шатлан эхэлнэ (ArcGIS «Too many
   * requests» — 2026-08-21-ний гүйцэтгэлийн аудит).
   */
  heavy?: true;
};

/**
 * ⚠️ ДАРААЛАЛ нь ТӨСЛИЙН МӨЧЛӨГӨӨР (төлөвлөлт → нөхцөл → гүйцэтгэл → хяналт →
 * санхүү), схемийн урсгалтай нийцүүлсэн. Түвшингээр эрэмбэлэхгүй — улаан нь
 * зангилааны ирмэг, тэмдэг, толгойн тоолуураар өөрөө анхаарал татна;
 * эрэмбэлбэл нэг үзүүлэлт өдөр бүр өөр газар байрлана.
 */
export const CEO_KPIS: CeoKpiDef[] = [
  { key: 'suitability', get title() { return tr('Тохиромжтой байдал'); }, icon: 'grid', view: 'analysis', load: loadSuitabilityKpi, heavy: true },
  { key: 'permits', get title() { return tr('Зөвшөөрөл'); }, icon: 'frame', view: 'zovshoorol', load: loadPermitsKpiSafe }, /* ⚠️ 2026-09-30: уналт кэшлэгдэхгүй хувилбар (permits.ts) */
  { key: 'land', get title() { return tr('Газар чөлөөлөлт'); }, icon: 'polygon', view: 'gazar', load: loadLandKpi, heavy: true },
  { key: 'schedule', get title() { return tr('Хуваарийн хоцрогдол'); }, icon: 'calendar', view: 'pkgProg', load: loadScheduleKpi },
  { key: 'variance', get title() { return tr('Обьёмын зөрүү'); }, icon: 'chart', view: 'guitsetgel', load: loadVarianceKpi, heavy: true },
  { key: 'qaqc', get title() { return tr('Чанарын хяналт (QAQC)'); }, icon: 'target', view: 'qaqc', load: loadQaqcKpi, heavy: true },
  { key: 'iot', get title() { return tr('IoT — босго хэтрэлт'); }, icon: 'radio', view: 'iot', load: loadIotKpiSafe }, /* ⚠️ 2026-09-25: уналт кэшлэгдэхгүй хувилбар (iot.ts) */
  { key: 'workforce', get title() { return tr('Хүн · техник'); }, icon: 'users', view: 'habea', load: loadWorkforceKpi },
  { key: 'safety', get title() { return tr('ХАБЭА — осол, зөрчил'); }, icon: 'shield', view: 'habea', load: loadSafetyKpi },
  { key: 'review', get title() { return tr('Хяналтын хоцролт'); }, icon: 'reset', view: 'guitsetgel', load: loadReviewKpi },
  { key: 'contractGap', get title() { return tr('Гэрээ ба төсвийн зөрүү'); }, icon: 'calc', view: 'finance', load: loadContractGapKpi },
  { key: 'uncontracted', get title() { return tr('Гэрээгүй ажил'); }, icon: 'pen', view: 'finance', load: loadUncontractedKpi },
  /* ⚠️ 2026-09-09: «акт» БИШ «олгосон санхүүжилт». Шинэ эх (HO_guitsetgel)
     нь бүртгэгдсэн ТӨЛБӨР — актын төлөв, хамрах хугацаа, суутгал байхгүй
     тул «акт» гэдэг нэр агуулгатайгаа зөрнө. */
  { key: 'ipc', get title() { return tr('IPC — олгосон санхүүжилт'); }, icon: 'file', view: 'finance', load: loadIpcKpi },
];
