/**
 * ХАЗАЙЛТЫН ШАЛГУУРЫН ЦЭВЭР ХЭСЭГ (2026-11-04) — `drift.check.mjs` ба `tools/data-audit.mjs` хоёулаа ашиглана:
 * кодод нэрлэсэн талбаруудыг цуглуулах · давхаргын нэр жишиж харьцуулах · санаатай орхигдсон давхаргууд.
 */
import { oidOf } from '@/lib/services';
import type { LayerDef } from '@/lib/services/layerDef';
import { AGENT_NOTES } from './notes';
import type { Dataset } from './datasets';

/** Давхаргын кодод нэрлэсэн талбарууд — oid · qty · paint · breaks · zoneField · facets · notes · (noZone биш бол) zone_id */
export function declaredFields(l: LayerDef): string[] {
  const f = new Set<string>([oidOf(l)]);
  if (l.qty?.field) f.add(l.qty.field);
  if (l.paint?.field) f.add(l.paint.field);
  if (l.breaks?.field) f.add(l.breaks.field);
  if (l.zoneField) f.add(l.zoneField);
  for (const x of l.facets ?? []) f.add(x.field);
  for (const k of Object.keys(AGENT_NOTES[l.id]?.fields ?? {})) f.add(k);
  if (!l.noZone && !l.zoneField) f.add('zone_id');
  return [...f];
}

/** Өгөгдлийн эх сурвалжийн (dataset) кодод нэрлэсэн талбарууд */
export const declaredDatasetFields = (d: Dataset): string[] =>
  [...new Set([d.oid ?? 'objectid', ...Object.keys(d.fields ?? {})])];

/** Давхаргын нэрийг жишихэд — доогуур зураас · том/жижиг · тэмдэгт ялгахгүй */
export const normLayerName = (s: unknown): string =>
  String(s).replace(/_/g, ' ').toLowerCase().replace(/[^0-9a-zа-яөү]/gi, '');

/** САНААТАЙ ОРХИГДСОН ДАВХАРГУУД — «бүртгэлд алга» гэж мэдээлэхгүй */
export const IGNORED_LAYERS: ReadonlySet<string> = new Set([
  'Цамхагт_кран_0813',
  'Цамхагт_кран_бүс_0813',
].map(normLayerName));
