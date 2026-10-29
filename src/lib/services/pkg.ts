import { t as tr } from '@/lib/i18nCore';
import { BAGTS_AJLUUD } from './env';
import type { LayerDef } from './layerDef';
import { bagtsKey } from './fields';

/* ══════════════════════ Дэд бүтцийн багцын каталог ══════════════════════ */

/**
 * `Selbe_ET_20260725`-ын 57 давхарга — ХҮСНЭГТЭЭР, гараар бичсэн 57 объектоор
 * БИШ.
 */
export type PkgFamily = "net" | "pow" | "src" | "site" | "soc" | "com";

export const PKG_HUE: Record<PkgFamily, string> = {
  net: "#ff0000", // Багц 5 — гадна дулаан, ус, ариутгах татуурга (эх зураг)
  pow: "#772c94", // Багц 6 — цахилгаан ба ХТП/РП (эх зураг)
  src: "#0891b2", // Багц 7–15 — эх үүсвэр, магистраль
  site: "#a16207", // Багц 16–18 — өндөржилт, тохижилт
  soc: "#22c55e", // Багц 19–21 — нийгмийн барилга
  com: "#7c3aed", // Холбоо — Багц 1–4
};

/**
 * `[давхаргын дугаар, геометр, нэр, гэр бүл, багцын код]`.
 */
const PKG_TABLE: [number, LayerDef["geom"], () => string, PkgFamily, string, number][] = [

  /* ── Багц 16–18 · өндөржилт, тохижилт, дулааны эх үүсвэр ── */
  [195, "area", () => tr('Багц 16.1 · Өндөржилт — Багц 1'), "site", 'БАГЦ-16.1', 82],
  [201, "area", () => tr('Багц 16.2 · Өндөржилт — Багц 2'), "site", 'БАГЦ-16.2', 83],
  [206, "area", () => tr('Багц 16.3 · Өндөржилт — Багц 3.1'), "site", 'БАГЦ-16.3', 84],
  [209, "area", () => tr('Багц 16.4 · Өндөржилт — Багц 3.2'), "site", 'БАГЦ-16.4', 85],
  [214, "area", () => tr('Багц 16.5 · Өндөржилт — Багц 3.3'), "site", 'БАГЦ-16.5', 86],
  [217, "area", () => tr('Багц 16.6 · Өндөржилт — Багц 4.1'), "site", 'БАГЦ-16.6', 87],
  [221, "area", () => tr('Багц 16.7 · Өндөржилт — Багц 4.2'), "site", 'БАГЦ-16.7', 88],
  [198, "area", () => tr('Багц 17.1 · Гадна тохижилт — Багц 1'), "site", 'БАГЦ-17.1', 75],
  [203, "area", () => tr('Багц 17.2 · Гадна тохижилт — Багц 2'), "site", 'БАГЦ-17.2', 76],
  [205, "area", () => tr('Багц 17.3 · Гадна тохижилт — Багц 3.1'), "site", 'БАГЦ-17.3', 77],
  [210, "area", () => tr('Багц 17.4 · Гадна тохижилт — Багц 3.2'), "site", 'БАГЦ-17.4', 78],
  [213, "area", () => tr('Багц 17.5 · Гадна тохижилт — Багц 3.3'), "site", 'БАГЦ-17.5', 79],
  [218, "area", () => tr('Багц 17.6 · Гадна тохижилт — Багц 4.1'), "site", 'БАГЦ-17.6', 80],
  [222, "area", () => tr('Багц 17.7 · Гадна тохижилт — Багц 4.2'), "site", 'БАГЦ-17.7', 81],

  /* ── Багц 19–21 · нийгмийн барилга ── */
  [230, "area", () => tr('Багц 19.1 · 960 хүүхдийн сургууль'), "soc", 'БАГЦ - 19.1', 90],
  [228, "area", () => tr('Багц 19.2 · 1560 хүүхдийн сургууль'), "soc", 'БАГЦ - 19.2', 92],
  [232, "area", () => tr('Багц 19.3 · 1260 хүүхдийн сургууль'), "soc", 'БАГЦ - 19.3', 91],
  [226, "area", () => tr('Багц 20.1 · 240 ортой цэцэрлэг'), "soc", 'БАГЦ - 20.1', 94],
  [234, "area", () => tr('Багц 20.2 · 240 ортой цэцэрлэг'), "soc", 'БАГЦ - 20.2', 95],
  [235, "area", () => tr('Багц 20.3 · 240 ортой цэцэрлэг'), "soc", 'БАГЦ - 20.3', 96],
  [236, "area", () => tr('Багц 20.4 · 240 ортой цэцэрлэг'), "soc", 'БАГЦ - 20.4', 97],
  [237, "area", () => tr('Багц 20.5 · 240 ортой цэцэрлэг'), "soc", 'БАГЦ - 20.5', 98],
  [243, "area", () => tr('Багц 21 · Төрийн үйлчилгээний барилга'), "soc", 'БАГЦ -21', 89],
  [242, "area", () => tr('Багц 21 · Хүүхдийн урлан бүтээх төв'), "soc", 'БАГЦ -21', 93],
];

/**
 * `ZONE_ID` талбартай багцын давхаргууд — ЗӨВХӨН эдгээр нь бүсийн нэгдсэн
 * шүүлтэд орно. Бусад нь CAD-аас шууд гарсан тул бүсийн харьяалалгүй.
 */
const PKG_ZONED = new Set([
  230, 228, 232, 226, 234, 235, 236, 237, 243,
]);

/** Барилгын хэлбэртэй багцууд `talbai_m2`-тай; бусад нь систем талбараас */
const PKG_AREA_ATTR = new Set([
  230, 228, 232, 226, 234, 235, 236, 237, 243,
]);

/**
 * ИНЖЕНЕРИЙН СИСТЕМ — «Инженерийн дэд бүтэц» хуудасны зүүн баганын бүлэг.
 */
/**
 * ИНЖЕНЕРИЙН ДЭД БҮТЭЦИЙН ШУГАМЫН ӨРГӨН — БҮГД 1px (2026-09-14, хэрэглэгчийн
 * шууд заавар: «line хэмжээ 1px болго инженерийн дэд бүтэцийн датануудын
 * line-уудыг»).
 */
export const srcLineWidth = (_w?: number): number => 1;

export type InfraSystem = 'heat' | 'water' | 'sewer' | 'power' | 'comm';

/**
 * `[давхаргын дугаар, геометр, нэр, гэр бүл, багцын код, систем, хэмжээний талбар]`
 */
/**
 * ДАВХАРГЫН СИМБОЛ — эх үйлчилгээний `drawingInfo.renderer.symbol`-оос ШУУД.
 */
type InfraSym = {
  /** Шугам */
  dash?: LayerDef["dash"];
  w?: number;
  /** Талбай */
  fill?: number;
  stroke?: string;
  sw?: number;
  sdash?: LayerDef["dash"];
  /** Цэг */
  marker?: LayerDef["marker"];
  size?: number;
};

export const INFRA_TABLE: [
  number, LayerDef["geom"], () => string, PkgFamily, string, InfraSystem, string | null, string,
  InfraSym, number,
][] = [
  /* ── ДУЛААН ХАНГАМЖ ── */
  [ 2, 'area' , () => tr('Багц 5.1 · ДХТ'), 'net' , 'БАГЦ-5.1'      , 'heat'  , 'SHAPE__Area'   , '#2697a8', { fill: 1, stroke: '#6e6e6e', sw: 0.7 }, 6],
  [ 3, 'area' , () => tr('Багц 5.1 · Дулааны худаг'), 'net' , 'БАГЦ-5.1'      , 'heat'  , 'SHAPE__Area'   , '#323232', { fill: 0.25, stroke: '#323232', sw: 3 }, 5],
  [ 6, 'line' , () => tr('Багц 5.1 · Дулааны буцах'), 'net' , 'БАГЦ-5.1'      , 'heat'  , 'urt_m'         , '#ff8c00', { dash: 'dash', w: 1 }, 3],
  [ 7, 'line' , () => tr('Багц 5.1 · Дулааны өгөх'), 'net' , 'БАГЦ-5.1'      , 'heat'  , 'urt_m'         , '#ff8c00', { dash: 'solid', w: 1 }, 4],
  [12, 'area' , () => tr('Багц 5.2 · ДХТ'), 'net' , 'БАГЦ-5.2'      , 'heat'  , 'SHAPE__Area'   , '#af833b', { fill: 1, stroke: '#6e6e6e', sw: 0.7 }, 16],
  [13, 'area' , () => tr('Багц 5.2 · Дулааны худаг'), 'net' , 'БАГЦ-5.2'      , 'heat'  , 'SHAPE__Area'   , '#323232', { fill: 0.25, stroke: '#323232', sw: 3 }, 15],
  [16, 'line' , () => tr('Багц 5.2 · Дулааны буцах'), 'net' , 'БАГЦ-5.2'      , 'heat'  , 'urt_m'         , '#ff8c00', { dash: 'dash', w: 1 }, 13],
  [17, 'line' , () => tr('Багц 5.2 · Дулааны өгөх'), 'net' , 'БАГЦ-5.2'      , 'heat'  , 'urt_m'         , '#ff8c00', { dash: 'solid', w: 1 }, 14],
  [22, 'line' , () => tr('Багц 5.3 · Дулааны буцах'), 'net' , 'БАГЦ-5.3'      , 'heat'  , 'urt_m'         , '#ff8c00', { dash: 'dash', w: 1 }, 23],
  [23, 'line' , () => tr('Багц 5.3 · Дулааны өгөх'), 'net' , 'БАГЦ-5.3'      , 'heat'  , 'urt_m'         , '#ff8c00', { dash: 'solid', w: 1 }, 24],
  [28, 'area' , () => tr('Багц 5.3 · ДХТ'), 'net' , 'БАГЦ-5.3'      , 'heat'  , 'SHAPE__Area'   , '#89483b', { fill: 1, stroke: '#6e6e6e', sw: 0.7 }, 26],
  [29, 'area' , () => tr('Багц 5.3 · Дулааны худаг'), 'net' , 'БАГЦ-5.3'      , 'heat'  , 'SHAPE__Area'   , '#323232', { fill: 0.25, stroke: '#323232', sw: 3 }, 25],
  [32, 'line' , () => tr('Багц 5.4 · Дулааны буцах'), 'net' , 'БАГЦ-5.4'      , 'heat'  , 'urt_m'         , '#ff8c00', { dash: 'dash', w: 1 }, 33],
  [33, 'line' , () => tr('Багц 5.4 · Дулааны өгөх'), 'net' , 'БАГЦ-5.4'      , 'heat'  , 'urt_m'         , '#ff8c00', { dash: 'solid', w: 1 }, 34],
  [38, 'area' , () => tr('Багц 5.4 · ДХТ'), 'net' , 'БАГЦ-5.4'      , 'heat'  , 'SHAPE__Area'   , '#2c4ba0', { fill: 1, stroke: '#6e6e6e', sw: 0.7 }, 36],
  [39, 'area' , () => tr('Багц 5.4 · Дулааны худаг'), 'net' , 'БАГЦ-5.4'      , 'heat'  , 'SHAPE__Area'   , '#323232', { fill: 0.25, stroke: '#323232', sw: 3 }, 35],
  [71, 'line' , () => tr('Багц 14 · дулаан хангамжын нэвтрэх сувгийн ажил'), 'src' , 'БАГЦ-14'       , 'heat'  , 'length_metr'   , '#c7f2fc', { dash: 'solid', w: 1 }, 71],
  [72, 'area' , () => tr('Багц 14 · дулаан хангамжын нэвтрэх сувгийн худаг'), 'src' , 'БАГЦ-14'       , 'heat'  , 'SHAPE__Area'   , '#323232', { fill: 0.25, stroke: '#323232', sw: 3 }, 72],
  [74, 'area' , () => tr('Багц 18 · дулаан хангамжын эх үүсвэр'), 'src' , 'БАГЦ-18'       , 'heat'  , 'SHAPE__Area'   , '#00a884', { fill: 0.5, stroke: '#00e6a9', sw: 1 }, 74],
  /* ── ЦЭВЭР УС ХАНГАМЖ ── */
  [ 8, 'line' , () => tr('Багц 5.1 · Халуун ус буцах'), 'net' , 'БАГЦ-5.1'      , 'water' , 'urt_m'         , '#ff0000', { dash: 'dash', w: 0.9 }, 8],
  [ 9, 'line' , () => tr('Багц 5.1 · Халуун ус өгөх'), 'net' , 'БАГЦ-5.1'      , 'water' , 'urt_m'         , '#ff0000', { dash: 'solid', w: 0.9 }, 9],
  [10, 'line' , () => tr('Багц 5.1 · Хэрэгцээний хүйтэн ус'), 'net' , 'БАГЦ-5.1'      , 'water' , 'urt_m'         , '#0070ff', { dash: 'solid', w: 0.9 }, 10],
  [18, 'line' , () => tr('Багц 5.2 · Халуун ус буцах'), 'net' , 'БАГЦ-5.2'      , 'water' , 'urt_m'         , '#ff0000', { dash: 'dash', w: 0.9 }, 18],
  [19, 'line' , () => tr('Багц 5.2 · Халуун ус өгөх'), 'net' , 'БАГЦ-5.2'      , 'water' , 'urt_m'         , '#ff0000', { dash: 'solid', w: 0.9 }, 19],
  [20, 'line' , () => tr('Багц 5.2 · Хэрэгцээний хүйтэн ус'), 'net' , 'БАГЦ-5.2'      , 'water' , 'urt_m'         , '#0070ff', { dash: 'solid', w: 0.9 }, 20],
  [24, 'line' , () => tr('Багц 5.3 · Халуун ус буцах'), 'net' , 'БАГЦ-5.3'      , 'water' , 'urt_m'         , '#ff0000', { dash: 'dash', w: 0.9 }, 28],
  [25, 'line' , () => tr('Багц 5.3 · Халуун ус өгөх'), 'net' , 'БАГЦ-5.3'      , 'water' , 'urt_m'         , '#ff0000', { dash: 'solid', w: 0.9 }, 29],
  [26, 'line' , () => tr('Багц 5.3 · Хэрэгцээний хүйтэн ус'), 'net' , 'БАГЦ-5.3'      , 'water' , 'urt_m'         , '#0070ff', { dash: 'solid', w: 0.9 }, 30],
  [34, 'line' , () => tr('Багц 5.4 · Халуун ус буцах'), 'net' , 'БАГЦ-5.4'      , 'water' , 'urt_m'         , '#ff0000', { dash: 'dash', w: 0.9 }, 38],
  [35, 'line' , () => tr('Багц 5.4 · Халуун ус өгөх'), 'net' , 'БАГЦ-5.4'      , 'water' , 'urt_m'         , '#ff0000', { dash: 'solid', w: 0.9 }, 39],
  [36, 'line' , () => tr('Багц 5.4 · Хэрэгцээний хүйтэн ус'), 'net' , 'БАГЦ-5.4'      , 'water' , 'urt_m'         , '#0070ff', { dash: 'solid', w: 0.9 }, 40],
  [64, 'line' , () => tr('Багц 10 · гадна ус хангамжын эх үүсвэрийн ажил'), 'src' , 'БАГЦ-10'       , 'water' , 'length_metr'   , '#005ce6', { dash: 'solid', w: 0.8 }, 64],
  [65, 'area' , () => tr('Багц 10 · гадна ус хангамжын эх үүсвэрийн худаг'), 'src' , 'БАГЦ-10'       , 'water' , 'SHAPE__Area'   , '#005ce6', { fill: 0.25, stroke: '#005ce6', sw: 0.8 }, 65],
  [66, 'line' , () => tr('Багц 11 · гадна ус хангамжын цагираг системийн ажил'), 'src' , 'БАГЦ-11'       , 'water' , 'length_metr'   , '#005ce6', { dash: 'solid', w: 0.8 }, 66],
  [67, 'area' , () => tr('Багц 11 · гадна ус хангамжын цагираг системийн худаг'), 'src' , 'БАГЦ-11'       , 'water' , 'SHAPE__Area'   , '#005ce6', { fill: 0.25, stroke: '#005ce6', sw: 0.8 }, 67],
  [70, 'area' , () => tr('Багц 13 · 2000м3 усан сан'), 'src' , 'БАГЦ-13'       , 'water' , 'SHAPE__Area'   , '#00e6a9', { fill: 1, stroke: '#00a884', sw: 1 }, 70],
  [73, 'area' , () => tr('Багц 15 · Насос станцын өргөтгөлийн барилга'), 'src' , 'БАГЦ-15'       , 'water' , 'SHAPE__Area'   , '#828282', { fill: 0.25, stroke: '#828282', sw: 0.6 }, 73],
  /* ── АРИУТГАХ ТАТУУРГА, ХӨРСНИЙ УС ── */
  [ 1, 'area' , () => tr('Багц 5.1 · Бохир худаг'), 'net' , 'БАГЦ-5.1'      , 'sewer' , 'SHAPE__Area'   , '#008000', { fill: 0.3, stroke: '#008000', sw: 0.9 }, 1],
  [ 4, 'area' , () => tr('Багц 5.1 · Лотки'), 'net' , 'БАГЦ-5.1'      , 'sewer' , 'SHAPE__Area'   , '#78c878', { fill: 0.3, stroke: '#78c878', sw: 0.9 }, 7],
  [ 5, 'line' , () => tr('Багц 5.1 · Бохир шугам'), 'net' , 'БАГЦ-5.1'      , 'sewer' , 'length_m'      , '#008000', { dash: 'solid', w: 0.9 }, 2],
  [11, 'area' , () => tr('Багц 5.2 · Бохир худаг'), 'net' , 'БАГЦ-5.2'      , 'sewer' , 'SHAPE__Area'   , '#008000', { fill: 0.3, stroke: '#008000', sw: 0.9 }, 11],
  [14, 'area' , () => tr('Багц 5.2 · Лотки'), 'net' , 'БАГЦ-5.2'      , 'sewer' , 'SHAPE__Area'   , '#78c878', { fill: 0.3, stroke: '#78c878', sw: 0.9 }, 17],
  [15, 'line' , () => tr('Багц 5.2 · Бохир шугам'), 'net' , 'БАГЦ-5.2'      , 'sewer' , 'length_m'      , '#008000', { dash: 'solid', w: 0.9 }, 12],
  [21, 'line' , () => tr('Багц 5.3 · Бохир шугам'), 'net' , 'БАГЦ-5.3'      , 'sewer' , 'length_m'      , '#008000', { dash: 'solid', w: 0.9 }, 22],
  [27, 'area' , () => tr('Багц 5.3 · Бохир худаг'), 'net' , 'БАГЦ-5.3'      , 'sewer' , 'SHAPE__Area'   , '#008000', { fill: 0.3, stroke: '#008000', sw: 0.9 }, 21],
  [30, 'area' , () => tr('Багц 5.3 · Лотки'), 'net' , 'БАГЦ-5.3'      , 'sewer' , 'SHAPE__Area'   , '#78c878', { fill: 0.3, stroke: '#78c878', sw: 0.9 }, 27],
  [31, 'line' , () => tr('Багц 5.4 · Бохир шугам'), 'net' , 'БАГЦ-5.4'      , 'sewer' , 'length_m'      , '#008000', { dash: 'solid', w: 0.9 }, 32],
  [37, 'area' , () => tr('Багц 5.4 · Бохир худаг'), 'net' , 'БАГЦ-5.4'      , 'sewer' , 'SHAPE__Area'   , '#008000', { fill: 0.3, stroke: '#008000', sw: 0.9 }, 31],
  [40, 'area' , () => tr('Багц 5.4 · Лотки'), 'net' , 'БАГЦ-5.4'      , 'sewer' , 'SHAPE__Area'   , '#78c878', { fill: 0.3, stroke: '#78c878', sw: 0.9 }, 37],
  [61, 'line' , () => tr('Багц 7 · хөрсний усны түвшин бууруулах зайлуулах'), 'src' , 'БАГЦ-7'        , 'sewer' , 'length_metr'   , '#fafcbf', { dash: 'solid', w: 1 }, 61],
  [62, 'area' , () => tr('Багц 7 · хөрсний усны түвшин бууруулах зайлуулах худаг'), 'src' , 'БАГЦ-7'        , 'sewer' , 'SHAPE__Area'   , '#323232', { fill: 0.25, stroke: '#323232', sw: 3 }, 62],
  [68, 'line' , () => tr('Багц 12 · Ариутгах татуургын600 шугамын ажил'), 'src' , 'БАГЦ-12'       , 'sewer' , 'urt_m'         , '#008000', { dash: 'solid', w: 1 }, 69],
  [69, 'area' , () => tr('Багц 12 · Ариутгах татуургын600 худаг'), 'src' , 'БАГЦ-12'       , 'sewer' , 'SHAPE__Area'   , '#4ce600', { fill: 0.5, stroke: '#267300', sw: 0.7 }, 68],
  /* ── ЦАХИЛГААН ХАНГАМЖ ── */
  [41, 'line' , () => tr('Багц 6.1 · цахилгааны шугам Багц1'), 'pow' , 'БАГЦ-6.1'      , 'power' , 'urt_m'         , '#e60000', { dash: 'solid', w: 0.9 }, 43],
  [45, 'line' , () => tr('Багц 6.2 · цахилгааны шугам Багц2'), 'pow' , 'БАГЦ-6.2'      , 'power' , 'urt_m'         , '#e60000', { dash: 'solid', w: 0.9 }, 46],
  [49, 'line' , () => tr('Багц 6.3 · цахилгааны шугам Багц3'), 'pow' , 'БАГЦ-6.3'      , 'power' , 'urt_m'         , '#e60000', { dash: 'solid', w: 0.9 }, 49],
  [52, 'line' , () => tr('Багц 6.4 · цахилгааны шугам Багц4'), 'pow' , 'БАГЦ-6.4'      , 'power' , 'urt_m'         , '#e60000', { dash: 'solid', w: 0.9 }, 52],
  [53, 'point', () => tr('Багц 6.5 · ХТП РП A'), 'pow' , 'БАГЦ-6.5'      , 'power' , null            , '#e60000', { marker: 'square', size: 1 }, 53],
  [54, 'area' , () => tr('Багц 6.5 · ХТП РП A хэсэг'), 'pow' , 'БАГЦ-6.5'      , 'power' , 'SHAPE__Area'   , '#e60000', { fill: 0.6, stroke: '#e60000', sw: 1 }, 54],
  [55, 'point', () => tr('Багц 6.6 · ХТП РП B'), 'pow' , 'БАГЦ-6.6'      , 'power' , null            , '#e60000', { marker: 'square', size: 1 }, 55],
  [56, 'area' , () => tr('Багц 6.6 · ХТП РП B хэсэг'), 'pow' , 'БАГЦ-6.6'      , 'power' , 'SHAPE__Area'   , '#e60000', { fill: 0.6, stroke: '#e60000', sw: 1 }, 56],
  [57, 'point', () => tr('Багц 6.7 · ХТП РП C'), 'pow' , 'БАГЦ-6.7'      , 'power' , null            , '#e60000', { marker: 'square', size: 1 }, 57],
  [58, 'area' , () => tr('Багц 6.7 · ХТП РП C хэсэг'), 'pow' , 'БАГЦ-6.7'      , 'power' , 'SHAPE__Area'   , '#e60000', { fill: 0.6, stroke: '#e60000', sw: 1 }, 58],
  [59, 'point', () => tr('Багц 6.8 · ХТП РП D'), 'pow' , 'БАГЦ-6.8'      , 'power' , null            , '#e60000', { marker: 'square', size: 1 }, 59],
  [60, 'area' , () => tr('Багц 6.8 · ХТП РП D хэсэг'), 'pow' , 'БАГЦ-6.8'      , 'power' , 'SHAPE__Area'   , '#e60000', { fill: 0.6, stroke: '#e60000', sw: 1 }, 60],
  [63, 'line' , () => tr('Багц 8.2 · Цахилгаан дамжуулах агаарын шугам'), 'src' , 'БАГЦ-8.2'      , 'power' , 'urt_m'         , '#ff7f7f', { dash: 'solid', w: 1 }, 63],
  /* ── ХОЛБОО ── */
  [42, 'area' , () => tr('Багц 6.1 · Холбоо худаг Багц1'), 'com' , 'Багц1_Холбоо'  , 'comm'  , 'SHAPE__Area'   , '#ff00c5', { fill: 0.25, stroke: '#ff00c5', sw: 0.9, sdash: 'dash' }, 42],
  [43, 'line' , () => tr('Багц 6.1 · Холбоо Багц1'), 'com' , 'Багц1_Холбоо'  , 'comm'  , 'shugam_urt'    , '#ff00c5', { dash: 'dash', w: 0.9 }, 41],
  [44, 'line' , () => tr('Багц 6.2 · Холбоо Багц2'), 'com' , 'Багц2_Холбоо'  , 'comm'  , 'shugam_urt'    , '#ff00c5', { dash: 'dash', w: 0.9 }, 44],
  [46, 'area' , () => tr('Багц 6.2 · Холбоо худаг Багц2'), 'com' , 'Багц2_Холбоо'  , 'comm'  , 'SHAPE__Area'   , '#ff00c5', { fill: 0.25, stroke: '#ff00c5', sw: 0.9, sdash: 'dash' }, 45],
  [47, 'line' , () => tr('Багц 6.3 · Холбоо Багц3'), 'com' , 'Багц3_Холбоо'  , 'comm'  , 'shugam_urt'    , '#ff00c5', { dash: 'dash', w: 0.9 }, 47],
  [48, 'area' , () => tr('Багц 6.3 · Холбоо худаг Багц3'), 'com' , 'Багц3_Холбоо'  , 'comm'  , 'SHAPE__Area'   , '#ff00c5', { fill: 0.25, stroke: '#ff00c5', sw: 0.9, sdash: 'dash' }, 48],
  [50, 'line' , () => tr('Багц 6.4 · Холбоо Багц4'), 'com' , 'Багц4_Холбоо'  , 'comm'  , 'shugam_urt'    , '#ff00c5', { dash: 'dash', w: 0.9 }, 50],
  [51, 'area' , () => tr('Багц 6.4 · Холбоо худаг Багц4'), 'com' , 'Багц4_Холбоо'  , 'comm'  , 'SHAPE__Area'   , '#ff00c5', { fill: 0.25, stroke: '#ff00c5', sw: 0.9, sdash: 'dash' }, 51],
];

/**
 * БАГЦЫН МӨРИЙН НЭГДСЭН БҮРТГЭЛ — хоёр хүснэгтийн аль нэгээс.
 */
type PkgRow = {
  id: string;
  n: number;
  geom: LayerDef["geom"];
  title: string;
  family: PkgFamily;
  bagts: string;
  /** Давхаргын БОДИТ хаяг (Enterprise) */
  url: string;
  sys?: InfraSystem;
  qtyField?: string | null;
  /** Давхаргын ӨӨРИЙН өнгө — байвал `PKG_HUE[family]`-г дарна */
  hue?: string;
  /** Эх үйлчилгээний симбол — байвал порталын анхдагч загварыг БҮРЭН дарна */
  sym?: InfraSym;
};

export const PKG_ROWS: PkgRow[] = [
  ...PKG_TABLE.map(([n, geom, title, family, bagts, ent]): PkgRow => ({
    id: `pkg:${n}`, n, geom, get title() { return title(); }, family, bagts, url: `${BAGTS_AJLUUD}/${ent}`,
  })),
  ...INFRA_TABLE.map(([n, geom, title, family, bagts, sys, qtyField, hue, sym, ent]): PkgRow => ({
    id: `infra:${n}`, n, geom, get title() { return title(); }, family, bagts, url: `${BAGTS_AJLUUD}/${ent}`, sys, qtyField, hue, sym,
  })),
];

/** Гэр бүлийн давхаргын id-ууд — каталогийн багц энэ хүснэгтээс л үүснэ */
export const pkgIds = (family: PkgFamily): string[] =>
  PKG_ROWS.filter((r) => r.family === family).map((r) => r.id);

/** «Инженерийн дэд бүтэц» бүлгийн доторх дараалал — `INFRA_SYSTEMS`-тэй ИЖИЛ байх ёстой */
export const INFRA_SYS_ORDER: readonly InfraSystem[] = ["heat", "water", "sewer", "power", "comm"];

/**
 * `Test0911S`-ээр СОЛИГДСОН хуучин давхаргууд — каталогт ХААНА Ч гарахгүй
 * (бүлэгт ч, «Бусад»-д ч), `PLAN_LAYER_IDS` нийлбэрт ч орохгүй.
 *
 *   et:7 10 9 11 8 4 18 23 17 16 3 19 — ЕТ-ийн 12 инженерийн шугам → infra 5.x
 *   et:124…127 — Багц 1–4 цахилгааны шугам → infra:41 45 49 52 (Багц 6.1–6.4)
 *   po:108 106 104 102 95 — Багц 5.1–5.4, 14 худаг/камер → infra худгууд
 *   pkg:246 — Багц 18 дулааны эх үүсвэр → infra:74
 */
export const CATALOG_REPLACED_HIDDEN: ReadonlySet<string> = new Set([
  "et:11",
]);

/**
 * Багцын код (нормчилсон) → тэр багцын давхаргын id-ууд.
 */
export const PKG_BY_BAGTS: Record<string, string[]> = PKG_ROWS.reduce(
  (m, r) => {
    const k = bagtsKey(r.bagts);
    (m[k] ??= []).push(r.id);
    return m;
  },
  {} as Record<string, string[]>,
);

/**
 * Багцын ГЭР БҮЛ → тэр бүлгийн давхаргын id-ууд.
 */
export const PKG_BY_FAMILY: Record<PkgFamily, string[]> = PKG_ROWS.reduce(
  (m, r) => {
    (m[r.family] ??= []).push(r.id);
    return m;
  },
  {} as Record<PkgFamily, string[]>,
);

/**
 * Багцын код (нормчилсон) → ГЭР БҮЛ. «Багцын хяналт» багцуудыг «Барилга
 * угсралт / Дэд бүтэц / Нийгмийн барилга / Өндөржилт» гэж ангилахад ашиглана
 * (2026-08-21) — блокгүй багцын төрлийг зөвхөн эндээс мэдэж болно.
 */
export const PKG_FAMILY_BY_BAGTS: Record<string, PkgFamily> = PKG_ROWS.reduce(
  (m, r) => {
    m[bagtsKey(r.bagts)] = r.family;
    return m;
  },
  {} as Record<string, PkgFamily>,
);

/**
 *   `pkg:*` (хуучин ET)  — хэмжээний талбар нь `PKG_ZONED` /
 *                        `PKG_AREA_ATTR` олонлогоос шийдэгдэнэ; бүсийн
  *                        шүүлтэд ордог.
 *   `infra:*` (Test0911S) — хэмжээний талбар нь ХҮСНЭГТЭД ил бичигдсэн
  *                        (давхарга бүрд өөр нэртэй); `ZONE_ID` байхгүй тул
  *                        БҮГД `noZone`.
 *
 * Тэр хоёрыг нэг илэрхийлэлд шахвал аль нэг нь чимээгүй буруу талбар уншина.
 */
export const PKG_LAYERS: LayerDef[] = PKG_ROWS.map((r) => {
  const { id, n, geom, family, bagts, url, qtyField, hue, sym } = r;
  return {
    id,
    n,
    url,
    get title() { return r.title; },
    topic: "plan" as const,
    geom,
    hue: hue ?? PKG_HUE[family],
    note: bagts,
    ...(geom === "area"
      ? sym
        ? {
            fill: sym.fill ?? 0.35,
            width: sym.sw ?? 0.9,
            ...(sym.stroke ? { stroke: sym.stroke } : {}),
            ...(sym.sdash ? { strokeDash: sym.sdash } : {}),
            srcSym: true as const,
          }
        : { fill: 0.35, width: 0.9 }
      : {}),
    ...(geom === "line"
      ? sym
        ? { width: sym.w ?? 1, dash: sym.dash ?? ("solid" as const), srcSym: true as const }
        : { width: 1.6, dash: "solid" as const }
      : {}),
    ...(geom === "point"
      ? sym
        ? { marker: sym.marker ?? ("circle" as const), size: sym.size ?? 7, srcSym: true as const }
        : { marker: "circle" as const, size: 7 }
      : {}),
    ...(geom === "point" || qtyField === null
      ? {}
      : {
          qty: qtyField
            ? { field: qtyField, unit: (geom === 'line' ? 'м' : 'м²') as 'м' | 'м²' }
            : geom === "line"
              ? {
                  field: PKG_ZONED.has(n) ? "urt_m" : "SHAPE__Length",
                  unit: 'м' as const,
                }
              : {
                  field: PKG_AREA_ATTR.has(n) ? "talbai_m2" : "SHAPE__Area",
                  unit: 'м²' as const,
                },
        }),
    ...(qtyField !== undefined || !PKG_ZONED.has(n) ? { noZone: true as const } : {}),
  };
});
