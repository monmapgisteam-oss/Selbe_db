/**
 * PDF-ИЙН НЭГДСЭН ХЭВ МАЯГ — өнгө, хүснэгтийн загвар, нүдний туслахууд.
 */
import type { CustomTableLayout, TableCell } from 'pdfmake/interfaces';
import { t as tr } from '@/lib/i18nCore';
import { PRINT_COLORS } from '@/lib/format';

export const PAPER = '#f9f9f7';   // хуудасны дэвсгэр
export const INK = '#0b0b0b';     // гарчиг
export const INK2 = '#33322f';    // үндсэн бичвэр
export const INK3 = '#52514e';    // хоёрдогч
export const MUTED = '#898781';   // тайлбар, толгойн шошго
export const RULE = '#e1e0d9';    // хүснэгтийн зураас
export const RULE2 = '#c3c2b7';   // тод зааг
export const SURF = '#f0efec';    // хөнгөн дүүргэлт
export const ACCENT = PRINT_COLORS.data;   // акцент · баганын үндсэн өнгө (--data)
export const RED = PRINT_COLORS.bad;       // --bad
export const AMBER = PRINT_COLORS.warn;    // --warn

/**
 * Roboto-д байхгүй тэмдэгтийг PDF-д орлуулна.
 */
export const T = (s: string) => s.replace(/₮/g, tr('төг'));

export const tableLayout: CustomTableLayout = {
  hLineColor: (i, node) => (i === 1 || i === node.table.body.length ? RULE2 : RULE),
  vLineWidth: () => 0,
  hLineWidth: (i, node) => (i === 0 ? 0 : i === 1 || i === node.table.body.length ? 0.9 : 0.5),
  paddingLeft: (i) => (i === 0 ? 0 : 6),
  paddingRight: (i, node) => (i === (Array.isArray(node.table.widths) ? node.table.widths.length : 1) - 1 ? 0 : 6),
  paddingTop: () => 5,
  paddingBottom: () => 5,
};

export const th = (t: string, right = false): TableCell =>
  ({ text: T(t), style: 'th', alignment: right ? 'right' : 'left' });
export const td = (t: string | number, right = false, color?: string): TableCell =>
  ({ text: T(String(t)), alignment: right ? 'right' : 'left', ...(color ? { color } : {}) });
export const tdBold = (t: string | number, right = false): TableCell =>
  ({ text: T(String(t)), alignment: right ? 'right' : 'left', bold: true });
