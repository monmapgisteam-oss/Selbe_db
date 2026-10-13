/** Самбарын статистикаас үл хамааран зурагдах эх давхаргуудыг сонгоно. */
export function hesegMapLayers({
  tab, compare, partial, previous, change, overlapActive, needActive, existing = [], hidden = [],
}: {
  tab: 'change' | 'overlap' | 'need';
  compare: boolean;
  partial: readonly string[];
  previous: readonly string[];
  change: { key: string; layers: readonly string[]; oldLayers: readonly string[] } | null;
  overlapActive: boolean;
  needActive: boolean;
  existing?: readonly string[];
  hidden?: readonly string[];
}): string[] {
  let ids: readonly string[];
  if (tab === 'change') {
    // Centerline нь зөвхөн статистик; зураг дээр эх полигон, эх renderer үлдэнэ.
    const next = change?.layers ?? partial;
    // Сонголтгүй үед хуучин ЕТ бүстэйгээ; сонгосон үед зөвхөн харгалзах эх давхаргууд.
    ids = compare ? [...(change?.oldLayers ?? previous), ...next] : next;
  } else if (tab === 'overlap') {
    // Хэсэгчилсэн ЕТ зүүн талд, сонгосон давхцлын график баруун талд.
    ids = compare || !overlapActive ? partial : [];
  } else {
    // Swipe-ийн зүүн талд 18-р хэсгийн инженерийн эх давхаргууд асна.
    ids = [...(compare ? existing : []), ...(needActive ? [] : partial)];
  }
  return [...new Set(ids)].filter((id) => !hidden.includes(id));
}
