/**
 * UBHUB ортофотогийн console-алдааг ЧИМЭЭГҮЙ болгох (side-effect модуль).
 *
 * ⚠️ UBHUB ортофото ImageServer-ууд одоогоор эрх ХААЛТТАЙ (503 «User couldn't
 * access this resource») тул ачаалагдахгүй. Ортофото анхдагчаар унтраалттай тул
 * газрын зурагт нөлөөгүй ч ArcGIS нь давхарга/layerview бүрийн load-алдааг
 * `console.error`-ээр улаанаар бичиж console-ыг дүүргэдэг. ЗӨВХӨН эдгээр ортофото
 * (`ImageryLayer` / imagery layerview) алдааг шүүнэ — бусад БҮХ алдаа хэвээр гарна.
 *
 * ⚠️ ЗААВАЛ @arcgis/core импортлохоос ӨМНӨ ажиллах ёстой: ArcGIS-ийн Logger нь
 * `console.error` лавлагаагаа init үедээ хадгалдаг тул дараа нь patch хийвэл
 * хожимддог. Иймд энэ модулийг `Root`-ын ХАМГИЙН ЭХНИЙ импорт болгоно (Root нь
 * газрын зураг/шинжилгээний dynamic @arcgis-аас өмнө ачаалагддаг).
 *
 * `log.interceptors` эдгээр алдааг барьдаггүй тул console түвшинд шүүв.
 */
if (typeof window !== 'undefined') {
  const g = globalThis as unknown as { __selbeOrthoErrFilter?: boolean };
  if (!g.__selbeOrthoErrFilter) {
    g.__selbeOrthoErrFilter = true;
    const orig = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      // ⚠️ Модулийн prefix (`[esri…]`) ба «imagery» нь ТУС ТУСДАА arg-д ирдэг тул
      //    БҮХ string arg-ыг нэгтгэж шалгана (зөвхөн эхнийг биш).
      const s = args.map((a) => (typeof a === 'string' ? a : '')).join(' ');
      if (
        /\[esri\.(layers\.ImageryLayer|views\.support\.LayerViewManager)\]/.test(s) &&
        /['" :]imagery/i.test(s)
      ) {
        return; // UBHUB ортофотогийн load/layerview-алдаа — чимээгүй
      }
      orig(...(args as []));
    };
  }
}

export {};
