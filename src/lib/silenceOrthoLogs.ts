/**
 * UBHUB ортофотогийн console-алдааг ЧИМЭЭГҮЙ болгох (side-effect модуль).
 *
 * ⚠️ Ортофото анхдагчаар унтраалттай (`setOrtho(false)`) тул газрын зурагт
 * нөлөөгүй. Хэрэв ImageServer түр унавал (өмнө 9 тусдаа service «Service not
 * started» болж байсан) ArcGIS нь давхарга/layerview бүрийн load-алдааг
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
      // ⚠️ 3D (SceneView) горимд 2D зурган симбол (picture-fill/picture-marker,
      //    esriPFS/esriPMS) дэмжигдэхгүй гэсэн esri-ийн warning — ХОР ХӨНӨӨЛГҮЙ:
      //    esri тэр симболыг зүгээр л алгасдаг. Console-ыг дүүргэхээс сэргийлж чимээгүй.
      if (/\[esri\.views\.3d\b/.test(s) && /unsupported in 3D/i.test(s)) {
        return;
      }
      orig(...(args as []));
    };
  }
}

export {};
