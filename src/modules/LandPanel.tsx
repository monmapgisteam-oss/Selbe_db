'use client';

import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { Tabs } from '@/components/ui';
import { useMap } from '@/components/MapCanvas';
import { ParcelPanel } from './ParcelPanel';
import { EstimatorPanel } from './EstimatorPanel';

/**
 * «Газар» модуль — чөлөөлөлт ба үнэлгээ.
 *
 * Хоёр өмнөх модулийг («Үлдсэн нэгж талбар», «Газрын үнэ тооцоолуур») нэгтгэв:
 * хоёулаа газартай холбоотой ч ХАРИЛЦАН ҮЙЛДЭЛ нь огт өөр — эхнийх нь талбар
 * дарж төлөв харах, хоёр дахь нь талбай зурж үнэ бодох. Тиймээс зэрэг харуулахгүй,
 * табаар салгав.
 *
 * ⚠️ Таб нь ДАВХАРГЫН ХАРАГДАЦЫГ ч удирдана. Энэ нь заавал:
 *   · Кадастр (43,041) ба үнэлгээт барилга (36,586) нь үлдсэн 217 талбарыг бүрэн
 *     дарж, чөлөөлөлтийн зураг уншигдахаа болино.
 *   · Тооцоолуурын AOI шүүлт (`setAoiFilter`) нь ил байгаа БҮХ давхаргад үйлчилдэг
 *     тул чөлөөлөлтийн давхарга ил байвал талбай зурахад тэр нь ч чимээгүй шүүгдэнэ.
 */
type Tab = 'clearance' | 'valuation';

/** Таб → ил байх дэд давхаргууд (`land:<key>` давхаргын id-ийн сүүлч хэсэг) */
const TAB_SUBLAYERS: Record<Tab, string[]> = {
  clearance: ['parcel'],
  valuation: ['cadastre', 'valuation'],
};

export function LandPanel({
  picked,
  pickedLayer,
  sublayers,
  setSublayers,
}: {
  picked: Record<string, unknown> | null;
  pickedLayer: string | null;
  sublayers: string[];
  setSublayers: Dispatch<SetStateAction<string[]>>;
}) {
  const { setAoiFilter, setHighlight } = useMap();

  // Идэвхтэй таб нь ил давхаргуудаас УНШИГДАНА — тусдаа төлөв барихгүй.
  // Ингэснээр таб ба зураг хоёр салах боломжгүй (нэг эх сурвалж).
  const tab: Tab = sublayers.includes('cadastre') ? 'valuation' : 'clearance';

  const go = (next: Tab) => {
    if (next === tab) return;
    // Өмнөх табын үлдэгдэл шүүлтийг заавал цэвэрлэнэ — эс бөгөөс нөгөө таб дээр
    // «яагаад цөөхөн объект харагдаж байна» гэдэг нь тайлагдахгүй үлдэнэ.
    setAoiFilter(null);
    setHighlight(null);
    setSublayers(TAB_SUBLAYERS[next]);
  };

  // Модулиас гарахад зурсан талбайн шүүлт үлдэхээс сэргийлнэ
  useEffect(() => () => setAoiFilter(null), [setAoiFilter]);

  return (
    <>
      <Tabs
        value={tab}
        onChange={(k) => go(k as Tab)}
        items={[
          { key: 'clearance', label: 'Чөлөөлөлт' },
          { key: 'valuation', label: 'Үнэлгээ' },
        ]}
      />

      {tab === 'clearance' ? (
        <ParcelPanel picked={pickedLayer === 'land:parcel' ? picked : null} />
      ) : (
        <EstimatorPanel />
      )}
    </>
  );
}
