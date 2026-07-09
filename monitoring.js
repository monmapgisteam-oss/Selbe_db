'use strict';

/* HTML escape — олон IIFE-д хуваалцана */
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

/* ── ArcGIS FeatureServer орг үндэс (URL өөрчлөгдвөл зөвхөн эндээс засна) ── */
const AGS1 = 'https://services-ap1.arcgis.com/ACqsMOmNLi5wIdIh/arcgis/rest/services';
const AGS2 = 'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services';

/* ── HERO STATS count-up ── */
(function(){
  const els=document.querySelectorAll('.hero-stats b[data-count]');
  if(!els.length) return;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
  els.forEach(function(el){
    const target=parseFloat(el.dataset.count), suffix=el.dataset.suffix||'';
    if(reduce){ el.textContent=target.toLocaleString('en-US')+suffix; return; }
    const dur=1600, start=performance.now();
    function frame(now){
      const p=Math.min((now-start)/dur,1);
      el.textContent=Math.floor((1-Math.pow(1-p,3))*target).toLocaleString('en-US')+suffix;
      if(p<1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
})();

/* ── HERO CTA — «3D хотын загвар»: самбар руу гүйлгээд 3D горимыг шууд асаана ── */
(function(){
  const b=document.getElementById('cta3d'); if(!b) return;
  b.addEventListener('click', function(){
    const btn3d=document.querySelector('#mapMode button[data-mode="3d"]');
    if(btn3d && !btn3d.classList.contains('active')) btn3d.click();
  });
})();

/* ── IMPACT DASHBOARD (data-driven, cross-filter) ── */
(function(){
  const DATA = {
    pop: { ac:'#00d4ff', chartT:'Үйлчилгээний хүртээмж\n20 минутын зайд',
      bars:[['Худалдаа',95],['Цэцэрлэг',90],['Сургууль',78],['Эмнэлэг',64]],
      detail:[['Орон сууц','8,575 айлын 113 блок орон сууц.'],
              ['Сургууль','3,780 хүүхдийн 3 блок ЕБС.'],
              ['Цэцэрлэг','1,200 хүүхдийн 5 блок цэцэрлэг.'],
              ['Эмнэлэг','100 ортой 1 блок эмнэлэг.']] },
    road: { ac:'#30f0a0', chartT:'Зорчилтын хуваарь (зорилтот)',
      bars:[['Явган',40],['Нийтийн тээвэр',30],['Дугуй',15],['Авто',15]],
      detail:[['Зам','Шинээр 13.2 км авто · 26.2 км дугуйн · 52 км явган зам.'],
              ['Зогсоол','7 блок · 47,530 м² талбай.'],
              ['Систем','Түгжрэл хянаж, нийтийн тээвэр, дохио зангаа, зогсоолыг оновчилно.']] },
    infra: { ac:'#f5c842', chartT:'Дэд бүтцийн ачааллын түвшин',
      bars:[['Дулаан',96],['Ус / бохир',82],['Цахилгаан',68],['Хог хаягдал',55]],
      detail:[['Дулаан','Өвлийн оргил ачааллын гол хязгаарлалт.'],
              ['Ус/бохир','~9,000–11,000 м³/өдрийн нэмэлт хэрэгцээ.'],
              ['Цахилгаан','Сүлжээ, дэд станцын ачаалал.']] },
    env: { ac:'#34d399', chartT:'Газар ашиглалт (%)',
      bars:[['Ногоон байгууламж',37],['Барилга',27],['Зам, талбай',22],['Ус, гол',14]],
      detail:[['Ногоон','58.11 га ногоон байгууламж — нийт талбайн 36.8%.'],
              ['Амралт','1.5 км урт Сэлбэ голын дагуух ногоон амралтын бүс.'],
              ['Систем','Агаар, ус, ногоон байгууламжийг тасралтгүй хэмжиж, бохирдлын шалтгааныг тогтооно.']] },
    econ: { ac:'#f472b6', chartT:'Эдийн засгийн нөлөө',
      bars:[['Орон сууц (айл)',100],['Ажлын талбай',72],['Худалдаа-үйлчилгээ',64],['Амьдралын чанар',88]],
      detail:[['Орон сууц','8,575 айлын 113 блок — хотын хомсдлыг бууруулна.'],
              ['Худалдаа','32 блок · 152,650 м² худалдаа-үйлчилгээний барилга.'],
              ['Спорт','1 блок спорт цогцолбор.'],
              ['Эдийн засаг','Орон нутгийн худалдаа, үл хөдлөхийн үнэ цэн нэмэгдэнэ.']] },
    land: { ac:'#fb923c', chartT:'Зориулалтаар нийт талбай',
      bars:[], summary:null, detail:[['Ачаалж байна','Өгөгдөл татаж байна…']] }
  };

  const cats = document.querySelectorAll('.agd-cat');
  if(!cats.length) return;
  const elBars=document.getElementById('agdBars'), elChartT=document.getElementById('agdChartTitle'),
        elDetail=document.getElementById('agdDetail');

  function render(key){
    const d = DATA[key]; if(!d) return;
    elChartT.textContent = d.chartT;
    elBars.innerHTML = d.bars.map(b=>{
      var lbl = (b[2]!=null) ? b[2] : b[1]+'%';
      return '<li style="--ac:'+d.ac+'"><div class="agd-bl"><span>'+esc(b[0])+'</span><b>'+lbl+'</b></div><div class="agd-bt"><i data-w="'+b[1]+'"></i></div></li>';
    }).join('');
    requestAnimationFrame(()=>{ elBars.querySelectorAll('.agd-bt i').forEach(i=>{ i.style.width=i.dataset.w+'%'; }); });
    var sumHTML = '';
    if(d.summary){
      var s = d.summary;
      sumHTML = '<div class="land-sum">'
        + '<div class="land-sc" style="--ac:'+d.ac+'"><div class="land-sc-v">'+(s.cnt||0).toLocaleString('en-US')+'</div><div class="land-sc-l">Нийт нэгж талбар</div></div>'
        + '<div class="land-sc" style="--ac:'+d.ac+'"><div class="land-sc-v">'+((s.m2||0)/10000).toFixed(2)+'<small> га</small></div><div class="land-sc-l">Нийт талбай</div></div>'
        + '</div>';
    }
    elDetail.innerHTML = sumHTML + d.detail.map(p=>
      '<p style="--ac:'+d.ac+'"><span class="agd-dtag">'+esc(p[0])+'</span><span class="agd-dtxt">'+esc(p[1])+'</span></p>'
    ).join('');
    // tag-баганыг тухайн категорийн хамгийн урт tag-аар тааруулах (текст ойр байх)
    elDetail.style.removeProperty('--tagcol');  // байгалийн өргөн хэмжихийн өмнө reset
    let _mt=0; elDetail.querySelectorAll('.agd-dtag').forEach(s=>{ _mt=Math.max(_mt, Math.ceil(s.offsetWidth)); });
    elDetail.style.setProperty('--tagcol', _mt+'px');
  }

  function setActive(active){
    cats.forEach(x=>{
      const on = x===active;
      x.classList.toggle('active', on);
      x.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
  cats.forEach(c=>{
    c.addEventListener('click',()=>{
      const key = c.dataset.imp;
      const wasActive = c.classList.contains('active');
      // Layer visibility toggle (2D map)
      if(window.__selbeApplyCatVisibility) window.__selbeApplyCatVisibility(key);
      if(wasActive){
        // Идэвхтэй товч дахин дарагдсан → бүх layer буцаад ил, товч idle
        setActive(null);
        return;
      }
      setActive(c);
      render(key);
    });
  });
  // view.when()-с дуудагдах callback — layer URL-аас авсан бодит өгөгдлийг DATA.land-д хийж render хийнэ
  window.__selbeRenderLand = function(summary, bars, detail){
    DATA.land.summary = summary;
    DATA.land.bars = bars;
    DATA.land.detail = detail;
    var active = document.querySelector('.agd-cat.active');
    if(active && active.dataset.imp === 'land') render('land');
  };

  render('pop');
})();

/* ── 2D / 3D MAP TOGGLE ── */
(function(){
  const mode=document.getElementById('mapMode'),
        c2=document.getElementById('arcgisMap'),
        cL=document.getElementById('arcgisMapLand'),
        cP=document.getElementById('arcgisMapProg'),
        cPa=document.getElementById('arcgisMapPatrol'),
        c3=document.getElementById('arcgisMap3d');
  if(!mode || !c3 || typeof require === 'undefined') return;
  let inited=false;
  function init3d(){
    if(inited) return; inited=true;
    // Тусдаа scene3d.html-ийг iframe-ээр (өөрийн WebGL context — 2D-тэй мөргөлдөхгүй)
    c3.innerHTML='<iframe src="scene3d.html" style="width:100%;height:100%;border:0;display:block" title="Сэлбэ 3D" allowfullscreen></iframe>';
  }
  let landInited=false;
  function initLand(){
    if(landInited) return; landInited=true;
    // Тусдаа landmap.html iframe — өөрийн WebGL context (2D MapView-тэй мөргөлдөхгүй)
    cL.innerHTML='<iframe src="landmap.html" style="width:100%;height:100%;border:0;display:block" title="Газар чөлөөлөлт"></iframe>';
  }
  let progInited=false;
  function initProg(){
    if(progInited) return; progInited=true;
    // Тусдаа progress.html iframe — building_GOL_barigdaj_ehelsen давхаргын явц
    cP.innerHTML='<iframe src="progress.html" style="width:100%;height:100%;border:0;display:block" title="Барилгын явц"></iframe>';
  }
  let patrolInited=false;
  function initPatrol(){
    if(patrolInited) return; patrolInited=true;
    // Тусдаа patrol.html iframe — ажилчдын online/offline хяналт + alert
    cPa.innerHTML='<iframe src="patrol.html" style="width:100%;height:100%;border:0;display:block" title="Патрол — Хүн хүч"></iframe>';
  }
  const stats=document.getElementById('sceneStats');
  const ssToggle=document.getElementById('ssToggle');
  if(ssToggle) ssToggle.addEventListener('click',function(e){ e.stopPropagation(); if(stats) stats.classList.toggle('collapsed'); });
  // Гадуур дарвал хаагдах (дэлгэцийн өөр хэсэг)
  document.addEventListener('click',function(e){
    if(stats && !stats.classList.contains('collapsed') && !stats.contains(e.target)) stats.classList.add('collapsed');
  });
  // 3D iframe дотор дарвал (window blur) хаагдах
  window.addEventListener('blur',function(){
    if(stats && !stats.classList.contains('collapsed')) stats.classList.add('collapsed');
  });
  mode.querySelectorAll('button').forEach(function(b){
    b.addEventListener('click',function(){
      mode.querySelectorAll('button').forEach(function(x){ x.classList.toggle('active', x===b); });
      const m=b.dataset.mode;
      c3.classList.toggle('show', m==='3d');
      cL.classList.toggle('show', m==='land');
      cP.classList.toggle('show', m==='prog');
      cPa.classList.toggle('show', m==='patrol');
      c2.style.visibility = (m==='2d') ? 'visible' : 'hidden';
      if(stats){ stats.classList.toggle('show', m==='3d'); stats.setAttribute('aria-hidden', m==='3d' ? 'false' : 'true'); }
      // Зүүн/баруун самбарыг динамик солих (land/prog — тусдаа самбар; patrol — бүтэн зураг)
      const custom = (m==='land' || m==='prog' || m==='patrol');
      function panel(id, showId){ const el=document.getElementById(id); if(el){ const on=(id===showId); el.classList.toggle('show', on); el.setAttribute('aria-hidden', on?'false':'true'); } }
      const lMain=document.getElementById('agdLeftMain'), rMain=document.getElementById('agdRightMain');
      if(lMain) lMain.style.display = custom ? 'none' : '';
      if(rMain) rMain.style.display = custom ? 'none' : '';
      const leftShow = m==='land' ? 'agdLeftLand' : (m==='prog' ? 'agdLeftProg' : '');
      const rightShow= m==='land' ? 'agdRightLand': (m==='prog' ? 'agdRightProg': '');
      panel('agdLeftLand', leftShow); panel('agdLeftProg', leftShow);
      panel('agdRightLand', rightShow); panel('agdRightProg', rightShow);
      const body=document.querySelector('.agd-body');
      if(body){ body.classList.toggle('land-mode', m==='land'); body.classList.toggle('prog-mode', m==='prog'); body.classList.toggle('patrol-mode', m==='patrol'); }
      if(m==='3d') init3d();
      if(m==='land') initLand();
      if(m==='prog') initProg();
      if(m==='patrol') initPatrol();
    });
  });
})();

/* ── Газар чөлөөлөлт — зүүн (building) + баруун (parcel donut) панель, lasso-р шүүгдэнэ ── */
(function(){
  const statsEl=document.getElementById('lcStats'), box=document.getElementById('bldDetail');
  // Баруун — parcel rigth_type donut
  function renderDonuts(counts){
    counts=counts||{};
    const total=(counts['эзэмших']||0)+(counts['өмчлөх']||0)+(counts['ашиглах']||0);
    function setD(id,nId,sId,val,color){
      const pie=document.getElementById(id); if(!pie) return;
      const raw=total?val/total*100:0, pct=raw>=1?Math.round(raw):Math.round(raw*10)/10;
      pie.style.background='conic-gradient('+color+' 0 '+raw+'%, rgba(255,255,255,.08) '+raw+'% 100%)';
      document.getElementById(nId).textContent=pct+'%';
      document.getElementById(sId).textContent=(val||0).toLocaleString('en-US')+' нэгж талбар';
    }
    setD('lpEz','lpEzN','lpEzS',counts['эзэмших']||0,'#30f0a0');
    setD('lpOm','lpOmN','lpOmS',counts['өмчлөх']||0,'#00d4ff');
    setD('lpAsh','lpAshN','lpAshS',counts['ашиглах']||0,'#f5c842');
  }
  // Зүүн — нэгж талбар (parcel) + барилга (build) үзүүлэлт
  function renderStats(p, b){
    if(!statsEl) return; p=p||{}; b=b||{};
    const rows=[
      ['🧩','Нэгж талбар (тоо)',(p.count||0).toLocaleString('en-US')],
      ['📐','Нэгж талбар (га)',((p.area||0)/10000).toLocaleString('en-US',{maximumFractionDigits:1})+' га'],
      ['🏢','Барилга (тоо)',(b.n||0).toLocaleString('en-US')],
      ['📏','Барилга (м²)',Math.round(b.area||0).toLocaleString('en-US')+' м²']
    ];
    statsEl.innerHTML=rows.map(r=>'<li><span class="k"><span>'+r[0]+'</span>'+r[1]+'</span><span class="v">'+r[2]+'</span></li>').join('');
  }
  // Барилгын дэлгэрэнгүй (9 талбар)
  const FIELDS=[['NIIT_UNE','Нийт үнэлгээ','tug'],['MKV_UNE','1 м²-ын үнэлгээ','tug'],['SARUUN_TUR','Сарын түрээсийн төлбөр','tug'],['OROO_TOO','Өрөөний тоо',''],['DAVHAR_TOO','Давхарын тоо',''],['TOROL','Ашиглалтын төрөл',''],['MATERIAL','Барилгын материал',''],['AJLIIN_BAI','Ажлын байрны тоо',''],['BAGTSAAMAI','Багтаамж','хүн']];
  function renderBld(a){
    if(!box) return; a=a||{};
    box.innerHTML=FIELDS.map(function(f){ var raw=a[f[0]]; var val=(raw==null||raw==='')?'—':(f[2]==='tug'?(Math.round(Number(raw)).toLocaleString('en-US')+' ₮'):(raw+(f[2]?(' '+f[2]):''))); return '<li><span class="k">'+f[1]+'</span><span class="v">'+esc(val)+'</span></li>'; }).join('');
  }
  // Бүтэн өгөгдөл (анхны байдал, цэвэрлэх үед сэргээх)
  let fullParcel=null, fullParcelStats=null, fullBld=null;
  function renderFullStats(){ renderStats(fullParcelStats||{}, fullBld||{}); }
  fetch(AGS1+"/Selbe_parcel/FeatureServer/0/query?where=1%3D1&groupByFieldsForStatistics=rigth_type&outStatistics=%5B%7B%22statisticType%22%3A%22count%22%2C%22onStatisticField%22%3A%22OBJECTID%22%2C%22outStatisticFieldName%22%3A%22c%22%7D%2C%7B%22statisticType%22%3A%22sum%22%2C%22onStatisticField%22%3A%22area_m2%22%2C%22outStatisticFieldName%22%3A%22a%22%7D%5D&f=json")
    .then(r=>r.json()).then(function(d){ const c={}; let cnt=0,ar=0; (d.features||[]).forEach(function(f){ c[f.attributes.rigth_type]=f.attributes.c||0; cnt+=f.attributes.c||0; ar+=f.attributes.a||0; }); fullParcel=c; fullParcelStats={count:cnt,area:ar}; renderDonuts(c); renderFullStats(); }).catch(function(){});
  fetch(AGS1+"/selbe_B/FeatureServer/0/query?where=1%3D1&outStatistics=%5B%7B%22statisticType%22%3A%22count%22%2C%22onStatisticField%22%3A%22FID%22%2C%22outStatisticFieldName%22%3A%22n%22%7D%2C%7B%22statisticType%22%3A%22sum%22%2C%22onStatisticField%22%3A%22area_m2%22%2C%22outStatisticFieldName%22%3A%22a%22%7D%5D&f=json")
    .then(r=>r.json()).then(function(d){ const a=((d.features||[])[0]||{}).attributes||{}; fullBld={n:a.n||0,area:a.a||0}; renderFullStats(); }).catch(function(){});

  // Хэрэгслийн товч → газрын зураг (iframe) руу команд
  const dBtn=document.getElementById('landDraw'), cBtn=document.getElementById('landClear');
  const ORIGIN=location.origin; // iframe-үүд ижил origin — postMessage-ийг тодорхой origin руу
  function landWin(){ var i=document.querySelector('#arcgisMapLand iframe'); return i&&i.contentWindow; }
  if(dBtn) dBtn.addEventListener('click', function(){ dBtn.classList.add('active'); resetDonutUI(); var w=landWin(); if(w) w.postMessage({type:'landTool',action:'draw'},ORIGIN); });
  if(cBtn) cBtn.addEventListener('click', function(){ if(dBtn) dBtn.classList.remove('active'); var w=landWin(); if(w) w.postMessage({type:'landTool',action:'clear'},ORIGIN); });

  // Donut дээр дарахад map-ийг rigth_type-аар шүүх
  const DONUTS=[['lpEz','эзэмших'],['lpOm','өмчлөх'],['lpAsh','ашиглах']];
  let donutFilter=null;
  // Donut шүүлтийн UI төлөвийг бүрэн арилгах (цэвэрлэх/шинэ сонголтын үед)
  function resetDonutUI(){
    donutFilter=null;
    DONUTS.forEach(function(x){ const c=document.getElementById(x[0]); if(c){ const cc=c.closest('.lp-cell'); if(cc){ cc.classList.remove('lp-active'); cc.setAttribute('aria-pressed','false'); } } });
  }
  DONUTS.forEach(function(d){
    const pie=document.getElementById(d[0]); if(!pie) return;
    const cell=pie.closest('.lp-cell'); if(!cell) return;
    cell.style.cursor='pointer';
    // Гар/товчлуураар ашиглах боломж (a11y)
    cell.setAttribute('role','button');
    cell.setAttribute('tabindex','0');
    cell.setAttribute('aria-pressed','false');
    function toggle(){
      donutFilter = (donutFilter===d[1]) ? null : d[1];
      DONUTS.forEach(function(x){ const c=document.getElementById(x[0]); if(c){ const cc=c.closest('.lp-cell'); if(cc){ const on=donutFilter===x[1]; cc.classList.toggle('lp-active', on); cc.setAttribute('aria-pressed', on?'true':'false'); } } });
      const w=landWin(); if(w) w.postMessage({ type:'parcelFilter', value:donutFilter }, ORIGIN);
    }
    cell.addEventListener('click', toggle);
    cell.addEventListener('keydown', function(e){ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); toggle(); } });
  });

  // Сонгож зурж буй полигоны талбай (Google Earth measure маягаар)
  const measEl=document.getElementById('lcMeasure');
  function renderMeasure(m2){
    if(!measEl) return;
    if(!m2 || m2<=0){ measEl.innerHTML=''; return; }
    const ha=(m2/10000).toLocaleString('en-US',{maximumFractionDigits:2});
    measEl.innerHTML='<li class="lc-meas-row"><span class="k"><span>📏</span>Сонгосон талбайн хэмжээ</span><span class="v">'+ha+' га</span></li>';
  }

  // Message: сонголт / цэвэрлэх / барилга сонголт / хэмжилт
  window.addEventListener('message', function(e){
    if(e.origin !== ORIGIN) return; // зөвхөн ижил origin-оос (landmap iframe)
    const m=e.data||{};
    if(m.type==='bldSelect'){ renderBld(m.attrs); }
    else if(m.type==='landMeasure'){ renderMeasure(m.area); }
    else if(m.type==='landSelect'){
      if(dBtn) dBtn.classList.remove('active');
      resetDonutUI(); // шинэ сонголтын эффект donut шүүлтийг дардаг тул UI-г нь ч арилгана
      const p=m.parcels||{}, b=m.buildings||{};
      renderDonuts(p.counts);
      renderStats({ count:p.total||0, area:p.area||0 }, { n:b.n||0, area:b.area||0 });
      if(b.sums) renderBld(b.sums); // сонгосон барилгуудын нийлбэр
    }
    else if(m.type==='landClear'){
      if(dBtn) dBtn.classList.remove('active');
      resetDonutUI();
      renderMeasure(0);
      if(fullParcel) renderDonuts(fullParcel);
      renderFullStats();
      if(box) box.innerHTML='<li class="bld-hint">Газрын зураг дээр барилга дарж сонгоно уу</li>';
    }
  });
})();

/* ── Барилгын явц — зүүн (нийт + сонгосон блок) + баруун (ангилал + компани) самбар ── */
(function(){
  const AC='#00d4ff';
  const sumEl=document.getElementById('progSum'), detEl=document.getElementById('progDetail'),
        distEl=document.getElementById('progDist'), compEl=document.getElementById('progComp');
  if(!sumEl) return;
  const ORIGIN=location.origin;

  // Нийт үзүүлэлт (4 карт)
  function renderSummary(s){
    s=s||{};
    sumEl.innerHTML=''
      + card((s.blok||0).toLocaleString('en-US'), 'Нийт блок')
      + card((s.ail||0).toLocaleString('en-US'), 'Нийт айл')
      + card(Math.round(s.guits||0)+'<small> %</small>', 'Дундаж гүйцэтгэл')
      + card((Math.round((s.davhar||0)*10)/10)+'<small> дав</small>', 'Дундаж давхар');
    function card(v,l){ return '<div class="land-sc" style="--ac:'+AC+'"><div class="land-sc-v">'+v+'</div><div class="land-sc-l">'+l+'</div></div>'; }
  }
  // Гүйцэтгэлийн ангилал — бараар
  const DIST_COL=['#ff5f57','#f5c842','#78d278','#30f0a0'];
  function renderDist(dist){
    dist=dist||[];
    const max=dist.reduce(function(a,b){ return Math.max(a,b.n||0); },0)||1;
    distEl.innerHTML=dist.map(function(d,i){
      const w=Math.round((d.n||0)/max*100);
      return '<li style="--ac:'+DIST_COL[i]+'"><div class="agd-bl"><span>'+esc(d.label)+'</span><b>'+(d.n||0)+' блок</b></div><div class="agd-bt"><i data-w="'+w+'"></i></div></li>';
    }).join('');
    requestAnimationFrame(function(){ distEl.querySelectorAll('.agd-bt i').forEach(function(i){ i.style.width=i.dataset.w+'%'; }); });
  }
  // Компаниар — жагсаалт
  function renderComps(comps){
    comps=comps||[];
    compEl.innerHTML=comps.map(function(c){
      return '<li><span class="k"><span>🏗️</span>'+esc(c.name)+'</span><span class="v">'+(c.c||0)+' блок</span></li>';
    }).join('') || '<li class="bld-hint">Мэдээлэл алга</li>';
  }
  // Сонгосон блокийн дэлгэрэнгүй — building_GOL_ТАЙЛБАР.txt-ийн дагуу
  // ЧУХАЛ: -1 = тухайн ажил тэр багцад байхгүй (N/A) — «-1 %» гэж бүү харуул
  const ID_FIELDS=[
    ['BLOK','Блокийн дугаар'],['BAGTS','Багц'],['TOROL','Барилгын төрөл'],
    ['BAR_COMP','Гүйцэтгэгч компани'],['AIL_TOO','Айлын тоо'],['DAVHAR','Давхрын тоо'],
    ['GUITS_OGN','Гүйцэтгэлийн огноо']
  ];
  const STAGE_FIELDS=[
    ['A_BELTGEL','Бэлтгэл ажил'],['B_BARILGA','Барилга угсралт'],['GAZAR','Газар шороо'],
    ['SUURI','Суурь'],['KARKAS','Каркас (төмөр бетон рам)'],['HANA','Хана'],
    ['HAALGA','Хаалга, цонх'],['DEEVER','Дээвэр'],['SHAL','Шал'],
    ['DOTOR','Дотор засал'],['GADNA','Гадна засал'],['LIFT','Лифт'],
    ['HALAALT','Халаалт, агаар сэлгэлт'],['US','Цэвэр бохир ус'],
    ['TSAHILGAAN','Цахилгаан, гэрэлтүүлэг'],['HOLBOO','Холбоо дохиолол']
  ];
  function pctColor(v){ return v>=75?'#30f0a0':v>=40?'#78d278':v>=15?'#f5c842':'#ff5f57'; }
  function fmtOgn(v){
    if(v==null||v===''||v===-1) return '—';
    if(typeof v==='number' && v>1e11){ const d=new Date(v); if(!isNaN(d.getTime())){ const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'.'+p(d.getMonth()+1)+'.'+p(d.getDate()); } }
    return String(v);
  }
  function renderDetail(a){
    a=a||{};
    // 1) Үндсэн мэдээлэл
    let html='<ul class="lc-stats prog-id">'+ID_FIELDS.map(function(f){
      let raw=a[f[0]], val;
      if(f[0]==='GUITS_OGN') val=fmtOgn(raw);
      else val=(raw==null||String(raw).trim()===''||raw===-1)?'—':String(raw);
      return '<li><span class="k">'+esc(f[1])+'</span><span class="v">'+esc(val)+'</span></li>';
    }).join('')+'</ul>';
    // 2) Блокийн нийт гүйцэтгэл (том бар)
    const gh=a.GUITS_HV;
    if(gh!=null && gh!==-1){
      const c=pctColor(gh), w=Math.max(0,Math.min(100,gh));
      html+='<div class="prog-total-bar"><div class="agd-bl"><span>Блокийн нийт гүйцэтгэл</span><b style="color:'+c+'">'+gh+'%</b></div>'
          + '<div class="agd-bt"><i style="width:'+w+'%;background:'+c+'"></i></div></div>';
    }
    // 3) Ажлын үе шат (мини бар; -1 → «байхгүй»)
    html+='<div class="prog-stage-t">Ажлын явц</div><ul class="agd-bars prog-stages">'+STAGE_FIELDS.map(function(f){
      let v=a[f[0]];
      if(v===-1) return '<li class="prog-na"><div class="agd-bl"><span>'+esc(f[1])+'</span><b>байхгүй</b></div></li>';
      if(v==null||v==='') return '';
      const c=pctColor(v), w=Math.max(0,Math.min(100,v));
      return '<li style="--ac:'+c+'"><div class="agd-bl"><span>'+esc(f[1])+'</span><b>'+v+'%</b></div><div class="agd-bt"><i data-w="'+w+'"></i></div></li>';
    }).join('')+'</ul>';
    detEl.innerHTML=html;
    requestAnimationFrame(function(){ detEl.querySelectorAll('.prog-stages .agd-bt i').forEach(function(i){ i.style.width=i.dataset.w+'%'; }); });
  }

  window.addEventListener('message', function(e){
    if(e.origin !== ORIGIN) return; // зөвхөн ижил origin-оос (progress iframe)
    const m=e.data||{};
    if(m.type==='progSummary'){ renderSummary(m.summary); renderDist(m.dist); renderComps(m.comps); }
    else if(m.type==='progSelect'){ renderDetail(m.attrs); }
  });
})();

/* ── ARCGIS MAP (Maps SDK for JS) — pure SDK, давхарга бүр service линкээр (map1-layers.js) ── */
(function(){
  const el = document.getElementById('arcgisMap');
  if(!el || typeof require === 'undefined') return;
  require([
    "esri/Map","esri/Basemap","esri/views/MapView",
    "esri/layers/FeatureLayer","esri/layers/VectorTileLayer",
    "esri/renderers/support/jsonUtils"
  ], function(Map, Basemap, MapView, FeatureLayer, VectorTileLayer, rendererJsonUtils){
    // Давхаргууд + загварыг map1-layers.js-ээс (WebMap 07f8…-ийн snapshot). Гарчиг/URL хадгалагдсан тул доорх логик өөрчлөгдөхгүй.
    const cfg = window.__SELBE_MAP1 || { layers:[] };
    const layers = cfg.layers.map(function(L){
      return new FeatureLayer({
        url:L.url, title:L.title, outFields:["*"],
        visible:L.visible!==false, opacity:(L.opacity==null?1:L.opacity),
        minScale:L.minScale||0, maxScale:L.maxScale||0,
        renderer: L.renderer ? rendererJsonUtils.fromJSON(L.renderer) : undefined,
        popupEnabled:false
      });
    });
    const nova = new Basemap({ baseLayers:[ new VectorTileLayer({ portalItem:{ id:cfg.basemapPortalId } }) ], title:"Nova" });
    const map = new Map({ basemap: nova, layers: layers });
    const view = window.__view2d = new MapView({ container:"arcgisMap", map:map, popupEnabled:false, constraints:{ rotationEnabled:false } });
    const loading = document.getElementById('agdMapLoading');

    // Категорийн товч дарахад тухайн категорид харгалзах layer л ил гарна
    window.__selbeCatMap = null;
    window.__selbeApplyCatVisibility = function(catKey){
      if(!window.__view2d) return;
      if(window.__selbeCatMap === catKey) catKey = null; // toggle off
      window.__selbeCatMap = catKey;
      var MAP = {
        pop:   ['Барилга'],
        road:  ['Зам','Дугуйн зам','Явган хүний зам'],
        infra: ['Шугам сүлжээ'],
        env:   ['Ногоон байгууламж','Гол'],
        econ:  ['Барилга'],
        land:  ['20260226_uldsen_negj_talbar']
      };
      // Хилийн давхарга (Khil/хил) — үргэлж харагдана, категорийн шүүлтэд орохгүй (лавлагаа хүрээ)
      function alwaysVisible(l){ var t=(l.title||'').toLowerCase(); return t.indexOf('khil')>-1 || t.indexOf('хил')>-1; }
      var whitelist = catKey ? MAP[catKey] : null;
      window.__view2d.map.allLayers.forEach(function(l){
        if(l.type !== 'feature') return;
        if(alwaysVisible(l)){ l.visible = true; return; } // хил — байнга ил
        if(!whitelist){ l.visible = true; return; }
        var t = (l.title||'').trim();
        var url = l.url || '';
        var match = whitelist.some(function(name){
          if(t === name) return true;
          if(name === 'Шугам сүлжээ' && url.indexOf('Selbe_utility') > -1) return true;
          return false;
        });
        l.visible = match;
      });
    };

    const hover    = document.getElementById('mapHover');
    const hoverRows= document.getElementById('mapHoverRows');
    const HOV = [
      ['Шугам_сүлжээний_төрөл','Шугам сүлжээний төрөл'],
      ['Тулгарсан_асуудал','Тулгарсан асуудал'],
      ['Эрсдэлийн_зэрэг','Эрсдэлийн зэрэг'],
      ['Засвар_үйлчилгээний_төрөл','Засвар үйлчилгээний төрөл']
    ];
    const attr     = document.getElementById('mapAttr');
    const attrBody = document.getElementById('mapAttrBody');
    const attrClose= document.getElementById('mapAttrClose');
    function topGraphic(r){
      const hit = r.results.filter(x=>x.graphic && x.graphic.layer);
      return hit.length ? hit[0].graphic : null;
    }
    if(attrClose) attrClose.addEventListener('click',()=>{ attr.classList.remove('show'); attr.setAttribute('aria-hidden','true'); });

    view.when(function(){
      if(loading) loading.classList.add('hidden');
      view.popupEnabled = false;

      // Сэлбэ бүс рүү камер (Барилга давхаргын extent — standard EPSG, аюулгүй)
      var _bl = view.map.allLayers.find(function(x){ return x.type==='feature' && x.title==='Барилга'; });
      if(_bl) _bl.when(function(){ view.goTo(_bl.fullExtent).catch(function(){}); }).catch(function(){});

      // ── Шугам сүлжээний НЭГДСЭН шүүлт ──
      // Төрлийн сонголт (дээд цэс) + гүйцэтгэлийн босго (баруун slider) хоёулаа
      // нэг definitionExpression-д нийлнэ — бие биенийхээ шүүлтийг дарж бичихгүй.
      const UTIL_FIELD = 'Бодит_гүйцэтгэл____';
      const utilState = { types:new Set(), thr:{} };
      function applyUtilExpr(utilLayer){
        if(!utilLayer) return;
        const hasTypes = utilState.types.size>0;
        const hasThr = Object.keys(utilState.thr).some(function(k){ return (utilState.thr[k]||0)>0; });
        if(!hasTypes && !hasThr){ utilLayer.definitionExpression = null; return; }
        const types = hasTypes ? Array.from(utilState.types) : [1,2,3,4,5];
        const parts = types.map(function(t){ return '(Type='+t+' AND '+UTIL_FIELD+'>='+(utilState.thr[t]||0)+')'; });
        if(!hasTypes) parts.push('(Type NOT IN (1,2,3,4,5))'); // төрөл сонгоогүй үед бусад объект хэвээр
        utilLayer.definitionExpression = parts.join(' OR ');
      }

      // ArcGIS legend widget (web map legend)
      require(["esri/widgets/Legend","esri/widgets/BasemapGallery","esri/widgets/Expand"], function(Legend, BasemapGallery, Expand){
        const legend = new Legend({ view: view });
        const exp = new Expand({ view: view, content: legend, expanded: false, expandTooltip: 'Тэмдэглэгээ' });
        view.ui.add(exp, "top-right");
        // Суурь зураг сонгогч
        const bgExp = new Expand({ view: view, content: new BasemapGallery({ view: view }), expanded: false, expandTooltip: 'Суурь зураг', expandIcon: 'basemap' });
        view.ui.add(bgExp, "top-right");
      });

      // FILTER — 2 тусдаа (Ерөнхий мэдээлэл / Шугам сүлжээ)
      (function(){
        const wraps = document.querySelectorAll('.agd-filter');
        if(!wraps.length) return;
        function rows(arr){
          return arr.map(function(l){
            return '<label class="agd-fitem"><input type="checkbox" data-id="'+l.id+'" '+(l.visible?'checked':'')+'/><span>'+(l.title||l.name||'Давхарга')+'</span></label>';
          }).join('');
        }
        const selected = new Set();
        const DIM = 0.2;
        let utilReset = function(){};
        function resetGeneral(){
          selected.clear();
          const g=document.getElementById('agdListGeneral');
          if(g) g.querySelectorAll('input[type=checkbox]').forEach(function(cb){ cb.checked=false; });
          applyHighlight();
        }
        function applyHighlight(){
          const feat = view.map.allLayers.toArray().filter(function(l){ return l.type==='feature'; });
          const any = selected.size>0;
          function effectFor(l){
            const t=(l.title||'').trim().toLowerCase();
            if(t.indexOf('ногоон')>-1) return null; // эффект өгөхгүй
            if(t==='зам') return 'brightness(1.2) drop-shadow(0 0 2px rgba(255,255,255,0.45))'; // зөвхөн "Зам" багасгасан
            return 'brightness(1.6) drop-shadow(0 0 5px rgba(255,255,255,0.75))'; // энгийн
          }
          feat.forEach(function(l){
            // l.visible-д гар хүрэхгүй — давхаргын ил/далд байдлыг категорийн товч эзэмшинэ
            l.opacity = !any ? 1 : (selected.has(l.id) ? 1 : DIM);
            l.effect = (any && selected.has(l.id)) ? effectFor(l) : null;
          });
        }
        function fill(el, arr){
          if(!el) return;
          el.innerHTML = rows(arr) || '<div class="agd-serial-load">Давхарга алга</div>';
          el.querySelectorAll('input[type=checkbox]').forEach(function(cb){
            cb.checked = false;
            cb.addEventListener('change',function(){
              if(cb.checked) selected.add(cb.dataset.id); else selected.delete(cb.dataset.id);
              applyHighlight();
            });
          });
        }
        function buildUtilTypes(utilLayer){
          const u=document.getElementById('agdListUtility'); if(!u) return;
          const TYPES=[{v:1,name:'Дулааны шугам'},{v:2,name:'Цахилгааны шугам'},{v:3,name:'Холбооны шугам'},{v:4,name:'Цэвэр усны шугам'},{v:5,name:'Бохирын шугам'}];
          u.innerHTML = TYPES.map(function(t){ return '<label class="agd-fitem"><input type="checkbox" data-type="'+t.v+'"/><span>'+t.name+'</span></label>'; }).join('');
          utilReset = function(){
            utilState.types.clear();
            u.querySelectorAll('input[type=checkbox]').forEach(function(cb){ cb.checked=false; });
            applyUtilExpr(utilLayer); // slider-ийн босго хадгалагдана — зөвхөн төрлийн шүүлт арилна
            if(utilLayer){ utilLayer.opacity=1; utilLayer.effect=null; }
            view.map.allLayers.toArray()
              .filter(function(l){ return l.type==='feature' && l.url && l.url.indexOf('Selbe_talbain_hynalt')>-1; })
              .forEach(function(l){ l.opacity=1; });
          };
          u.querySelectorAll('input[type=checkbox]').forEach(function(cb){
            cb.checked=false;
            cb.addEventListener('change',function(){
              const t=+cb.dataset.type;
              if(cb.checked) utilState.types.add(t); else utilState.types.delete(t);
              applyUtilExpr(utilLayer);
              if(utilLayer){
                utilLayer.opacity = 1;
                utilLayer.effect = utilState.types.size ? 'brightness(1.6) drop-shadow(0 0 5px rgba(255,255,255,0.75))' : null;
              }
              // Шугамаар шүүхэд ерөнхий мэдээллийн давхаргууд бүдгэрнэ
              view.map.allLayers.toArray()
                .filter(function(l){ return l.type==='feature' && l.url && l.url.indexOf('Selbe_talbain_hynalt')>-1; })
                .forEach(function(l){ l.opacity = utilState.types.size ? 0.3 : 1; });
            });
          });
        }
        function build(){
          const layers=view.map.allLayers.toArray().filter(function(l){ return l.type==='feature'; });
          fill(document.getElementById('agdListGeneral'), layers.filter(function(l){ return l.url && l.url.indexOf('Selbe_talbain_hynalt')>-1; }));
          buildUtilTypes(layers.filter(function(l){ return l.url && l.url.indexOf('Selbe_utility')>-1; })[0]);
        }
        Promise.all(view.map.allLayers.toArray().map(function(l){ return l.load().catch(function(){}); })).then(build);
        function closeAll(){ wraps.forEach(function(w){ w.querySelector('.agd-filter-menu').classList.remove('open'); w.querySelector('.agd-filter-btn').setAttribute('aria-expanded','false'); }); }
        wraps.forEach(function(w){
          const btn=w.querySelector('.agd-filter-btn'), menu=w.querySelector('.agd-filter-menu');
          btn.addEventListener('click',function(e){
            e.stopPropagation();
            const willOpen=!menu.classList.contains('open');
            closeAll();
            if(willOpen){ menu.classList.add('open'); btn.setAttribute('aria-expanded','true'); }
          });
          // Цэс дотор дарахад нээлттэй хэвээр (олон зүйл сонгох) — зөвхөн гадуур дарахад хаагдана
          menu.addEventListener('click',function(e){ e.stopPropagation(); });
          // Filter-head дээр дарвал тухайн шүүлтийг reset хийнэ
          const head=w.querySelector('.agd-filter-head');
          if(head){
            head.title='Шүүлтийг цэвэрлэх';
            head.addEventListener('click',function(e){
              e.stopPropagation();
              if(w.querySelector('#agdListUtility')) utilReset(); else resetGeneral();
            });
          }
        });
        document.addEventListener('click',closeAll);
      })();

      // Бүх талбарыг татах (hitTest дээр attribute бүрэн ирэхийн тулд)
      view.map.allLayers.forEach(function(l){
        if(l.type === 'feature'){ l.outFields = ['*']; }
      });

      // PIE — Барилгын гүйцэтгэлийн зэрэглэл (Бодит + зохиомжилсон Төлөвлөсөн)
      (function(){
        const layer=view.map.allLayers.find(function(x){ return x.type==='feature' && x.title==='Барилга'; });
        const pieB=document.getElementById('pieBod'), pieT=document.getElementById('pieTpl');
        if(!layer || !pieB) return;
        function colFor(v){ return '#00d4ff'; }
        function render(pie,centerEl,pct){
          const c=colFor(pct);
          pie.style.background='conic-gradient('+c+' 0 '+pct+'%, rgba(255,255,255,.08) '+pct+'% 100%)';
          if(centerEl){ centerEl.textContent=pct+'%'; centerEl.style.color=c; }
        }
        const q=layer.createQuery(); q.where='1=1'; q.outStatistics=[{statisticType:'avg',onStatisticField:'Bod_guits',outStatisticFieldName:'a'}];
        layer.queryFeatures(q).then(function(r){
          const av=Math.round((r.features[0]?r.features[0].attributes.a:0)||0);
          render(pieB, document.getElementById('pieBodC'), av);
          // Төлөвлөсөн = бодит + 18% (үзүүлэнгийн зохиомол; бодит төлөвлөгөөний өгөгдөл байхгүй)
          render(pieT, document.getElementById('pieTplC'), Math.min(100, av+18));
        });
      })();


      // LINE CHART (tplB) — Төлөвлөсөн vs Бодит гүйцэтгэл салбараар
      (function(){
        const host=document.getElementById('tplB'); if(!host) return;
        const CATS=[['Барилга','Барилга'],['Явган хүний зам','Явган'],['Шугам сүлжээ','Шугам'],['Зам','Зам'],['Дугуйн зам','Дугуй']];
        const tasks=CATS.map(function(c){
          let l, field;
          if(c[0]==='Шугам сүлжээ'){ l=view.map.allLayers.find(function(x){ return x.type==='feature' && x.url && x.url.indexOf('Selbe_utility')>-1; }); field='Бодит_гүйцэтгэл____'; }
          else { l=view.map.allLayers.find(function(x){ return x.type==='feature' && x.title===c[0]; }); field='Bod_guits'; }
          if(!l) return Promise.resolve(0);
          const q=l.createQuery(); q.where='1=1'; q.outStatistics=[{statisticType:'avg',onStatisticField:field,outStatisticFieldName:'a'}];
          return l.queryFeatures(q).then(function(r){ return Math.round((r.features[0]?r.features[0].attributes.a:0)||0); }).catch(function(){ return 0; });
        });
        Promise.all(tasks).then(function(actual){
          const OFF=[24,18,6,27,20]; // Төлөвлөсөн шугамын зохиомол нэмэгдэл (demo) — салбар тус бүрийн %
          const plan=actual.map(function(v,i){ return Math.min(100,v+(OFF[i]||18)); });
          draw(CATS.map(function(c){return c[1];}), [
            {name:'Төлөвлөсөн (жишиг)',color:'#3b82f6',vals:plan},
            {name:'Бодит',color:'#00d4ff',vals:actual}
          ]);
        });
        function draw(labels, series){
          const W=320,H=185,pl=16,pr=12,pt=18,pb=34, iw=W-pl-pr, ih=H-pt-pb;
          // Y-тэнхлэгийг өгөгдөлд тааруулах (доорх хоосон зайг багасгах)
          const all=series.reduce(function(a,s){ return a.concat(s.vals); },[]);
          const lo=Math.min.apply(null,all), hi=Math.max.apply(null,all);
          let yMin=Math.max(0, Math.floor((lo-8)/10)*10);
          let yMax=Math.min(100, Math.ceil((hi+4)/10)*10);
          if(yMax<=yMin) yMax=yMin+10;
          const span=yMax-yMin, mid=Math.round((yMin+yMax)/2);
          const x=function(i){ return pl + (labels.length<=1?iw/2:i*iw/(labels.length-1)); };
          const y=function(v){ return pt + ih - ((v-yMin)/span*ih); };
          let svg='<svg viewBox="0 0 '+W+' '+H+'" class="lc-svg">';
          [yMin,mid,yMax].forEach(function(g){ const yy=y(g); svg+='<line x1="'+pl+'" y1="'+yy+'" x2="'+(W-pr)+'" y2="'+yy+'" stroke="rgba(255,255,255,.08)"/>'; svg+='<text x="'+(pl-4)+'" y="'+(yy+3)+'" fill="rgba(255,255,255,.3)" font-size="8" text-anchor="end">'+g+'</text>'; });
          series.forEach(function(s){
            const pts=s.vals.map(function(v,i){ return x(i)+','+y(v); });
            svg+='<polyline points="'+pts.join(' ')+'" fill="none" stroke="'+s.color+'" stroke-width="1.4" stroke-linejoin="round"/>';
            s.vals.forEach(function(v,i){ svg+='<circle cx="'+x(i)+'" cy="'+y(v)+'" r="2.4" fill="'+s.color+'"/>'; });
          });
          labels.forEach(function(l,i){ svg+='<text x="'+x(i)+'" y="'+(H-12)+'" fill="rgba(232,236,240,.6)" font-size="9" text-anchor="middle">'+l+'</text>'; });
          svg+='</svg>';
          const leg='<div class="lc-leg">'+series.map(function(s){ return '<span><i style="background:'+s.color+'"></i>'+s.name+'</span>'; }).join('')+'</div>';
          host.innerHTML = leg + svg;
        }
      })();

      // БОДИТ ГҮЙЦЭТГЭЛ — интерактив slider, чирэхэд газрын зураг шүүгдэнэ
      (function(){
        const host=document.getElementById('agdRightBot'); if(!host) return;
        const GEN=['Барилга','Явган хүний зам','Ногоон байгууламж','Зам','Дугуйн зам'];
        const UT=[[1,'Дулааны шугам'],[2,'Цахилгааны шугам'],[3,'Холбооны шугам'],[4,'Цэвэр усны шугам'],[5,'Бохирын шугам']];
        const util=view.map.allLayers.find(function(x){ return x.type==='feature' && x.url && x.url.indexOf('Selbe_utility')>-1; });
        const UF=UTIL_FIELD; // нэгдсэн utilState-тэй хамт ажиллана (applyUtilExpr)
        const out=[], tasks=[];
        // Хувиар шүүх үед: идэвхтэй шүүгдэж буй давхаргаас бусад бүх давхарга тунгалаг болно
        const genThr={}, DIM_SLIDER=0.1;
        function applyDim(){
          const feats=view.map.allLayers.toArray().filter(function(l){ return l.type==='feature'; });
          const active=new Set();
          out.forEach(function(r){ if(r.kind==='gen' && (genThr[r.n]||0)>0 && r.layer) active.add(r.layer); });
          if(util && UT.some(function(ut){ return (utilState.thr[ut[0]]||0)>0; })) active.add(util);
          const any=active.size>0;
          feats.forEach(function(l){ l.opacity = !any ? 1 : (active.has(l) ? 1 : DIM_SLIDER); });
        }
        GEN.forEach(function(title,i){
          const l=view.map.allLayers.find(function(x){ return x.type==='feature' && x.title===title; });
          const q=l&&l.createQuery(); if(q){ q.where='1=1'; q.outStatistics=[{statisticType:'avg',onStatisticField:'Bod_guits',outStatisticFieldName:'b'}];
            tasks.push(l.queryFeatures(q).then(function(r){ out.push({n:title,v:Math.round((r.features[0]?r.features[0].attributes.b:0)||0),o:i,kind:'gen',layer:l}); }).catch(function(){ out.push({n:title,v:0,o:i,kind:'gen',layer:l}); }));
          } else out.push({n:title,v:0,o:i,kind:'gen'});
        });
        UT.forEach(function(ut,i){
          if(!util){ out.push({n:ut[1],v:0,o:10+i,kind:'util',t:ut[0]}); return; }
          const q=util.createQuery(); q.where='Type='+ut[0]; q.outStatistics=[{statisticType:'avg',onStatisticField:UF,outStatisticFieldName:'b'}];
          tasks.push(util.queryFeatures(q).then(function(r){ out.push({n:ut[1],v:Math.round((r.features[0]?r.features[0].attributes.b:0)||0),o:10+i,kind:'util',t:ut[0]}); }).catch(function(){ out.push({n:ut[1],v:0,o:10+i,kind:'util',t:ut[0]}); }));
        });
        Promise.all(tasks).then(function(){
          out.sort(function(a,b){ return a.o-b.o; });
          function makeRow(r){
            const row=document.createElement('div'); row.className='bg-row';
            row.innerHTML='<div class="bg-rt"><span>'+r.n+'</span><b class="bg-val">'+r.v+'%</b></div><input type="range" class="bg-range" min="0" max="100" value="'+r.v+'"/>';
            const range=row.querySelector('.bg-range'), val=row.querySelector('.bg-val');
            range.addEventListener('input',function(){
              val.textContent=range.value+'%';
              const v=+range.value;
              if(r.kind==='gen'){ genThr[r.n]=v; if(r.layer) r.layer.definitionExpression = (v>0) ? ('Bod_guits >= '+v) : null; }
              else { utilState.thr[r.t]=v; applyUtilExpr(util); }
              applyDim(); // шүүж буйгаас бусад давхаргыг тунгалаг болгох
            });
            return row;
          }
          function makeGroup(title, items, collapsed){
            const g=document.createElement('div'); g.className='bgg'+(collapsed?' collapsed':'');
            const h=document.createElement('div'); h.className='bgg-h'; h.innerHTML='<span>'+title+'</span><span class="bgg-c">▾</span>';
            const body=document.createElement('div'); body.className='bgg-b';
            h.addEventListener('click',function(){ g.classList.toggle('collapsed'); });
            items.forEach(function(r){ body.appendChild(makeRow(r)); });
            g.appendChild(h); g.appendChild(body); return g;
          }
          host.appendChild(makeGroup('Ерөнхий мэдээлэл', out.filter(function(r){ return r.kind==='gen'; }), false));
          host.appendChild(makeGroup('Шугам сүлжээ', out.filter(function(r){ return r.kind==='util'; }), true));
        });
      })();

      // Талбарын дараалал (хамгийн чухал нь эхэнд)
      const PREF = ['Шугам_сүлжээний_төрөл','Материал','Length_km','Голч__мм_','Техникийн_төлөв_байдал','Эрсдэлийн_зэрэг','Тулгарсан_асуудал','Статус','Сүүлд_засвар_хийсэн_огноо','Сүүлд_үзлэг_хийсэн_огноо'];
      const LABELS = { 'Length_km':'Урт (км)' };
      function fieldMeta(layer){ const m={}; ((layer&&layer.fields)||[]).forEach(f=>{ m[f.name]={alias:f.alias||f.name,type:f.type}; }); return m; }
      function fmtVal(v,type,name){
        if(v===null||v==='') return '—';
        const isDate = type==='esriFieldTypeDate' || /огноо|date/i.test(name||'') || (typeof v==='number' && v>1e11);
        if(isDate){
          const d=new Date(Number(v));
          if(!isNaN(d.getTime())){ const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'.'+p(d.getMonth()+1)+'.'+p(d.getDate()); }
          return v;
        }
        if(typeof v==='number') return Math.round(v*100)/100;
        return v;
      }
      function valColor(v){
        const s = String(v).toLowerCase();
        // Эерэг (ногоон) — эхэнд шалгана (гэмтэлгүй зэрэг "гүй"-тэй үгсийг улаанаас сэргийлнэ)
        if(/гэмтэлгүй|эрсдэлгүй|асуудалгүй|бага|сайн|хэвийн|ашиглалтад|шинэ|дуусс?ан/.test(s)) return '#30f0a0';
        // Дунд (шар)
        if(/дунд|анхаар|хүлээгд/.test(s)) return '#f5c842';
        // Сөрөг (улаан)
        if(/өндөр|муу|ноцтой|гэмт|осол|сэрэмж|аюул|эвдэр/.test(s)) return '#ff6b6b';
        return '';
      }

      // ── Үлдсэн нэгж талбар — шууд FeatureServer/1 руу query илгээх ──
      (function(){
        var BASE = AGS2+'/20260226_uldsen_negj_talbar/FeatureServer/1/query';
        var u1 = new URL(BASE);
        u1.searchParams.set('where','1=1');
        u1.searchParams.set('outStatistics', JSON.stringify([
          {statisticType:'count',onStatisticField:'FID',outStatisticFieldName:'cnt'},
          {statisticType:'sum',onStatisticField:'area_m2',outStatisticFieldName:'tot'}
        ]));
        u1.searchParams.set('f','json');
        var u2 = new URL(BASE);
        u2.searchParams.set('where','1=1');
        u2.searchParams.set('groupByFieldsForStatistics','landuse_de');
        u2.searchParams.set('outStatistics', JSON.stringify([
          {statisticType:'count',onStatisticField:'FID',outStatisticFieldName:'cnt'},
          {statisticType:'sum',onStatisticField:'area_m2',outStatisticFieldName:'area'}
        ]));
        u2.searchParams.set('f','json');
        Promise.all([fetch(u1.toString()).then(function(r){return r.json();}), fetch(u2.toString()).then(function(r){return r.json();})])
          .then(function(d){
            var a1 = ((d[0].features||[])[0]||{}).attributes||{};
            var raw = (d[1].features||[]).map(function(f){return f.attributes;});
            var cnt = a1.cnt||0, totM2 = a1.tot||0;
            // Хоосон/цагаан зайт landuse_de-г нэг "Тодорхойгүй" бүлэгт нэгтгэх
            var agg = {};
            raw.forEach(function(r){
              var name = (r.landuse_de||'').trim() || 'Зориулалт тодорхойгүй';
              if(!agg[name]) agg[name] = { name:name, area:0, cnt:0 };
              agg[name].area += r.area||0;
              agg[name].cnt  += r.cnt||0;
            });
            var rows = Object.keys(agg).map(function(k){ return agg[k]; })
                        .sort(function(a,b){ return b.area-a.area; });
            function pctOf(a){ return totM2 ? a/totM2*100 : 0; }
            function pctLabel(a){ var p=pctOf(a); return p>0&&p<1 ? '<1%' : Math.round(p)+'%'; }
            // График бар дээр: талбай (га) ба хувь
            var bars = rows.map(function(r){
              return [r.name, Math.round(pctOf(r.area)), (r.area/10000).toFixed(1)+' га · '+pctLabel(r.area)];
            });
            var summary = { cnt:cnt, m2:totM2 };
            // Дэлгэрэнгүй жагсаалт хэрэггүй — зөвхөн summary card + график
            if(window.__selbeRenderLand) window.__selbeRenderLand(summary, bars, []);
          }).catch(function(e){
            console.error('Үлдсэн нэгж талбар fetch алдаа:', e);
            if(window.__selbeRenderLand) window.__selbeRenderLand(null, [], [['Алдаа','Өгөгдөл ачаалж чадсангүй']]);
          });
      })();

      // HOVER
      let hoverBusy = false; // нэг үед нэг л hitTest (pointer-move бүрт биш) — гүйцэтгэл
      view.on('pointer-move', function(event){
        if(hoverBusy) return; hoverBusy = true;
        view.hitTest(event).then(function(r){
          hoverBusy = false;
          const g = topGraphic(r);
          if(g){
            const a = g.attributes || {};
            const rowsHtml = HOV.map(p=>{
              const v = a[p[0]];
              if(v===null || v===undefined || v==='') return '';
              const c = valColor(v); const st = c ? ' style="color:'+c+'"' : '';
              return '<div class="map-hover-row"><span>'+p[1]+'</span><b'+st+'>'+esc(v)+'</b></div>';
            }).join('');
            if(rowsHtml){
              // Мэдээлэлтэй объект дээр л панель гаргана (хоосон хайрцаг харуулахгүй)
              hoverRows.innerHTML = rowsHtml;
              hover.style.left = event.x + 'px';
              hover.style.top  = event.y + 'px';
              hover.classList.add('show');
            } else {
              hover.classList.remove('show');
            }
            view.container.style.cursor = 'pointer';
          } else {
            hover.classList.remove('show');
            view.container.style.cursor = 'default';
          }
        }).catch(function(){ hoverBusy = false; });
      });
      view.on('pointer-leave', function(){ hover.classList.remove('show'); });

      // CLICK → attribute preview
      view.on('click', function(event){
        view.hitTest(event).then(function(r){
          const g = topGraphic(r);
          // Зөвхөн шугам сүлжээ (Selbe_utility) давхаргад л preview гаргана
          const isUtil = g && g.layer && g.layer.url && g.layer.url.indexOf('Selbe_utility') > -1;
          if(!g || !isUtil){ attr.classList.remove('show'); attr.setAttribute('aria-hidden','true'); return; }
          const a = g.attributes || {};
          const fm = fieldMeta(g.layer);
          let keys = PREF.filter(k=>k in a && a[k]!==null && a[k]!=='');
          if(!keys.length) keys = Object.keys(a).filter(k=>a[k]!==null && a[k]!=='' && !/^(objectid|fid|globalid|shape|entity|layer|^id$|^type$|objectid_1)/i.test(k)).slice(0,16);
          attrBody.innerHTML = keys.length
            ? keys.map(k=>{ const meta=fm[k]||{}; const val=fmtVal(a[k],meta.type,k); const c=valColor(val); const st=c?' style="color:'+c+'"':''; return '<div class="map-attr-row"><span class="k">'+esc(LABELS[k]||meta.alias||k)+'</span><span class="v"'+st+'>'+esc(val)+'</span></div>'; }).join('')
            : '<p style="color:var(--muted);font-size:.78rem;margin:6px 0">Шинж чанарын мэдээлэл алга.</p>';
          attr.classList.add('show'); attr.setAttribute('aria-hidden','false');
        });
      });
    }, function(){
      if(loading) loading.textContent='Газрын зураг ачаалж чадсангүй (хандалт хязгаарлагдсан байж болзошгүй).';
    });
  });
})();

/* ── MOBILE NAV ── */
const ham = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');
function closeMobile(){
  ham.classList.remove('open');
  mobileMenu.classList.remove('open');
  ham.setAttribute('aria-expanded','false');
}
ham.addEventListener('click',()=>{
  const open = mobileMenu.classList.toggle('open');
  ham.classList.toggle('open',open);
  ham.setAttribute('aria-expanded', open ? 'true' : 'false');
});
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeMobile(); });

/* ── NAV PILL: HIDE ON SCROLL DOWN ── */
(function(){
  const els = document.querySelectorAll('nav .nav-links, nav .brand--nav');
  if(!els.length) return;
  function onScroll(){
    // Дээд талд (hero) байхад харагдана, доош гүйлгэхэд нав болон лого нуугдана
    const hide = window.scrollY > 80;
    els.forEach(el=>el.classList.toggle('nav-hidden', hide));
  }
  window.addEventListener('scroll', onScroll, {passive:true});
  onScroll();
})();

/* ── ARC CANVAS ── */
(function(){
  const c = document.getElementById('arc-canvas');
  if(!c) return;
  const ctx = c.getContext('2d');
  const COLORS = ['#00d4ff','#d94cf7','#f5c842','#30f0a0'];
  let W=0, H=0, arcs=[], pts=[];

  function buildPts(){
    pts=[];
    for(let i=0;i<60;i++) pts.push({x:Math.random()*W, y:Math.random()*H});
  }
  function mkArc(){
    if(!pts.length) return null;
    const a=pts[Math.floor(Math.random()*pts.length)];
    const b=pts[Math.floor(Math.random()*pts.length)];
    return{
      ax:a.x,ay:a.y,bx:b.x,by:b.y,
      t:Math.random(),
      speed:0.003+Math.random()*0.005,
      color:COLORS[Math.floor(Math.random()*COLORS.length)],
      alpha:0.1+Math.random()*0.2,
      width:0.5+Math.random()*1.2
    };
  }
  function resize(){
    const r=c.parentElement.getBoundingClientRect();
    W=c.width=r.width||window.innerWidth;
    H=c.height=r.height||window.innerHeight;
    buildPts();
    arcs=[];
    for(let i=0;i<40;i++) arcs.push(mkArc());
  }
  function drawArc(a){
    const mx=(a.ax+a.bx)/2;
    const my=Math.min(a.ay,a.by)-Math.abs(a.bx-a.ax)*0.4;
    const steps=60, end=Math.floor(steps*a.t);
    ctx.beginPath();
    for(let i=0;i<=end;i++){
      const t=i/steps;
      const px=(1-t)*(1-t)*a.ax+2*(1-t)*t*mx+t*t*a.bx;
      const py=(1-t)*(1-t)*a.ay+2*(1-t)*t*my+t*t*a.by;
      i===0?ctx.moveTo(px,py):ctx.lineTo(px,py);
    }
    ctx.strokeStyle=a.color; ctx.globalAlpha=a.alpha; ctx.lineWidth=a.width; ctx.stroke();
    if(a.t>0&&a.t<1){
      const t=a.t;
      const px=(1-t)*(1-t)*a.ax+2*(1-t)*t*mx+t*t*a.bx;
      const py=(1-t)*(1-t)*a.ay+2*(1-t)*t*my+t*t*a.by;
      ctx.beginPath(); ctx.arc(px,py,2.5,0,Math.PI*2);
      ctx.fillStyle=a.color; ctx.globalAlpha=Math.min(a.alpha*2,.9); ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  function drawDots(){
    ctx.fillStyle='rgba(0,212,255,0.18)';
    pts.forEach(p=>{ ctx.beginPath(); ctx.arc(p.x,p.y,1.5,0,Math.PI*2); ctx.fill(); });
  }
  function animate(){
    ctx.clearRect(0,0,W,H);
    drawDots();
    for(let i=0;i<arcs.length;i++){
      if(!arcs[i]){arcs[i]=mkArc();continue;}
      arcs[i].t+=arcs[i].speed;
      if(arcs[i].t>=1){arcs[i]=mkArc();continue;}
      drawArc(arcs[i]);
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(()=>{ resize(); animate(); });
  window.addEventListener('resize',resize);
})();

/* ── SCROLL REVEAL ── */
const revealObs = new IntersectionObserver(entries=>{
  entries.forEach(e=>{ if(e.isIntersecting){e.target.classList.add('v');revealObs.unobserve(e.target);} });
},{threshold:0.07});
document.querySelectorAll('.r').forEach(el=>revealObs.observe(el));

// Typewriter hero-sub
(function(){
  const el = document.getElementById('heroSub');
  const text = 'GIS болон AI-д суурилсан ухаалаг хотын платформ — 158 га нутаг дэвсгэрийн орон зай, дэд бүтэц, IoT мэдрэгч, нөлөөллийг бодит цагт загварчилж, шинжилж, удирдана.';
  const typeSpeed = 38;
  const pauseAfter = 3200;
  const fadeTime = 700;

  function typewrite(){
    el.textContent = '';
    el.style.opacity = '1';
    el.classList.remove('hide-cursor');
    let i = 0;
    const iv = setInterval(()=>{
      el.textContent += text[i];
      i++;
      if(i >= text.length){
        clearInterval(iv);
        el.classList.add('hide-cursor');
        setTimeout(()=>{
          el.style.opacity = '0';
        }, pauseAfter);
      }
    }, typeSpeed);
  }
  setTimeout(typewrite, 800);
})();

/* ── ДЭД БҮТЭЦ БА ГАЗРЫН НЭГЖ ТАЛБАР — 4 ArcGIS үйлчилгээ, интерактив газрын зурагтай ── */
(function(){
  const host = document.getElementById('infra'); if(!host) return;
  const B = 'https://services.arcgis.com/HJzgwvlNIXssnQar/arcgis/rest/services';
  const ORIGIN = location.origin;
  function q(layerUrl, params){
    const qs = Object.keys(params).map(k=>k+'='+encodeURIComponent(params[k])).join('&');
    return fetch(layerUrl+'/query?'+qs+'&f=json').then(r=>r.json());
  }
  const CNT = '[{"statisticType":"count","onStatisticField":"OBJECTID","outStatisticFieldName":"c"}]';
  function fmt(n){ return Math.round(n).toLocaleString('en-US'); }

  // ── Интерактив газрын зураг (iframe) ──
  let mapWin = null, sel = null;
  (function initMap(){
    const wrap = host.querySelector('.ix-mapwrap'); if(!wrap) return;
    const ifr = document.createElement('iframe');
    ifr.src = 'inframap.html'; ifr.title = 'Дэд бүтэц газрын зураг';
    ifr.addEventListener('load', function(){ mapWin = ifr.contentWindow; const l=document.getElementById('ixMapLoad'); if(l) l.remove(); });
    wrap.appendChild(ifr);
  })();
  function post(kind, value){ if(mapWin) mapWin.postMessage({ type:'infraFilter', kind:kind, value:value }, ORIGIN); }
  function unselAll(){ host.querySelectorAll('.ixc.sel').forEach(el=>el.classList.remove('sel')); }
  function clearSel(){ sel=null; unselAll(); post('clear'); }
  function pick(el, kind, value){
    if(sel && sel.kind===kind && String(sel.value)===String(value)){ clearSel(); return; }
    unselAll(); el.classList.add('sel'); sel={kind:kind,value:value}; post(kind, value);
  }
  const clrBtn = document.getElementById('ixClear'); if(clrBtn) clrBtn.addEventListener('click', clearSel);

  function barRows(el, rows, fmtVal, kind){ // rows: [label, value, color, filterVal?]
    const max = Math.max.apply(null, rows.map(r=>r[1]).concat([1]));
    el.innerHTML = rows.map(function(r){
      const pct = Math.max(2, Math.round(r[1]/max*100));
      const attr = kind ? (' class="ixc" data-k="'+kind+'" data-v="'+esc(String(r[3]!=null?r[3]:r[0]))+'"') : '';
      return '<li'+attr+'><span class="ix-bl" title="'+esc(r[0])+'">'+esc(r[0])+'</span>'
        +'<span class="ix-btrack"><span class="ix-bfill" style="width:'+pct+'%;background:'+r[2]+'"></span></span>'
        +'<span class="ix-bv">'+fmtVal(r[1])+'</span></li>';
    }).join('');
    if(kind) el.querySelectorAll('.ixc').forEach(function(li){ li.addEventListener('click', function(){ pick(li, li.dataset.k, li.dataset.v); }); });
  }
  function fail(id){ const el=document.getElementById(id); if(el) el.innerHTML='<li class="ix-load">Ачаалж чадсангүй</li>'; }

  // 1) bagts_hil — багцаар талбай (м²)
  q(B+'/bagts_hil/FeatureServer/34', { where:'1=1', groupByFieldsForStatistics:'BAGTS',
      outStatistics:'[{"statisticType":"sum","onStatisticField":"Shape__Area","outStatisticFieldName":"ar"}]' })
    .then(function(d){
      if(d.error) throw d.error;
      const rows = (d.features||[]).map(function(f){ const n=(f.attributes.BAGTS||'—').trim()||'—'; return [n, f.attributes.ar||0, 'linear-gradient(90deg,#00d4ff,#0aa2cc)', n]; })
        .sort((a,b)=>b[1]-a[1]);
      barRows(document.getElementById('ixBagts'), rows, v=>fmt(v)+' м²', 'bagts');
      const tot = rows.reduce((s,r)=>s+r[1],0);
      document.getElementById('ixBagtsHa').textContent = (tot/10000).toFixed(1);
    }).catch(function(){ fail('ixBagts'); });

  // 2) Үлдсэн нэгж талбар — нийт тоо + талбай
  q(B+'/20260226_uldsen_negj_talbar_selbe/FeatureServer/35', { where:'1=1',
      outStatistics:'[{"statisticType":"count","onStatisticField":"OBJECTID","outStatisticFieldName":"c"},{"statisticType":"sum","onStatisticField":"area_m2","outStatisticFieldName":"ar"}]' })
    .then(function(d){
      const a=(d.features&&d.features[0]||{}).attributes||{};
      document.getElementById('ixParcels').textContent = fmt(a.c||0);
      document.getElementById('ixParcelHa').textContent = ((a.ar||0)/10000).toFixed(1);
    }).catch(function(){});

  // 2б) Эрхийн төрлөөр — донат
  q(B+'/20260226_uldsen_negj_talbar_selbe/FeatureServer/35', { where:'1=1', groupByFieldsForStatistics:'rigth_type', outStatistics:CNT })
    .then(function(d){
      if(d.error) throw d.error;
      const bucket={};
      (d.features||[]).forEach(function(f){
        const k=(f.attributes.rigth_type||'').trim();
        const key = k==='өмчлөх'?'Өмчлөх':(k==='Эзэмших'?'Эзэмших':'Тодорхойгүй');
        bucket[key]=(bucket[key]||0)+(f.attributes.c||0);
      });
      const COL={ 'Өмчлөх':'#00d4ff','Эзэмших':'#30f0a0','Тодорхойгүй':'#5b6b82' };
      const rows=['Өмчлөх','Эзэмших','Тодорхойгүй'].filter(k=>bucket[k]).map(k=>[k,bucket[k],COL[k]]);
      const tot=rows.reduce((s,r)=>s+r[1],0)||1;
      let acc=0; const segs=rows.map(function(r){ const a=acc/tot*100, b=(acc+r[1])/tot*100; acc+=r[1]; return r[2]+' '+a+'% '+b+'%'; });
      const pie=document.getElementById('ixRightPie');
      pie.style.background='conic-gradient('+segs.join(',')+')';
      document.getElementById('ixRightC').textContent=fmt(tot);
      const leg=document.getElementById('ixRightLeg');
      leg.innerHTML=rows.map(function(r){
        const pc=Math.round(r[1]/tot*100);
        return '<li class="ixc" data-k="right" data-v="'+esc(r[0])+'"><span class="ix-dot2" style="background:'+r[2]+'"></span>'+esc(r[0])+'<b>'+fmt(r[1])+' · '+pc+'%</b></li>';
      }).join('');
      leg.querySelectorAll('.ixc').forEach(function(li){ li.addEventListener('click', function(){ pick(li,'right',li.dataset.v); }); });
    }).catch(function(){ document.getElementById('ixRightC').textContent='—'; });

  // 3) Road_shugam_suljee — инженерийн сүлжээний урт (км)
  const NETS=[['Гадна дулаан хангамж',1,'#f5c842'],['Ариутгах татуурга',0,'#22d3ff'],['Борооны ус зайлуулах',2,'#30f0a0']];
  Promise.all(NETS.map(function(n){
    return q(B+'/Road_shugam_suljee/FeatureServer/'+n[1], { where:'1=1',
        outStatistics:'[{"statisticType":"sum","onStatisticField":"Shape__Length","outStatisticFieldName":"len"}]' })
      .then(function(d){ const a=(d.features&&d.features[0]||{}).attributes||{}; return [n[0],(a.len||0)/1000,n[2],n[1]]; })
      .catch(function(){ return [n[0],0,n[2],n[1]]; });
  })).then(function(rows){
    rows.sort((a,b)=>b[1]-a[1]);
    barRows(document.getElementById('ixRoads'), rows, v=>v.toFixed(1)+' км', 'road');
    document.getElementById('ixRoadKm').textContent = rows.reduce((s,r)=>s+r[1],0).toFixed(0);
  }).catch(function(){ fail('ixRoads'); });

  // 4) barilga_20260709 — барилгын хээ (га) + талбайн хэмжээ харьцуулалт
  function sumAr(d){ return ((d.features&&d.features[0]||{}).attributes||{}).ar||0; }
  Promise.all([
    q(B+'/bagts_hil/FeatureServer/34', { where:'1=1', outStatistics:'[{"statisticType":"sum","onStatisticField":"Shape__Area","outStatisticFieldName":"ar"}]' }),
    q(B+'/20260226_uldsen_negj_talbar_selbe/FeatureServer/35', { where:'1=1', outStatistics:'[{"statisticType":"sum","onStatisticField":"area_m2","outStatisticFieldName":"ar"}]' }),
    q(B+'/barilga_20260709/FeatureServer/0', { where:"Layer NOT LIKE '%TEXT%'", outStatistics:'[{"statisticType":"sum","onStatisticField":"Shape__Area","outStatisticFieldName":"ar"}]' })
  ]).then(function(res){
    const bagts=sumAr(res[0])/10000, parcel=sumAr(res[1])/10000, bld=sumAr(res[2])/10000;
    document.getElementById('ixBldHa').textContent = bld.toFixed(1);
    barRows(document.getElementById('ixBld'), [
      ['Багцын хил', bagts, 'linear-gradient(90deg,#8b5cf6,#6d28d9)'],
      ['Нэгж талбар', parcel, 'linear-gradient(90deg,#22d3ff,#0aa2cc)'],
      ['Барилгын хээ', bld, 'linear-gradient(90deg,#30f0a0,#12b886)']
    ], v=>v.toFixed(1)+' га');
  }).catch(function(){ fail('ixBld'); document.getElementById('ixBldHa').textContent='—'; });

  // ── Газрын зургаас сонголт ирвэл графикийн мөрийг тодруулах ──
  window.addEventListener('message', function(e){
    if(e.origin!==ORIGIN) return; const d=e.data||{};
    if(d.type==='infraCleared'){ sel=null; unselAll(); return; }
    if(d.type!=='infraSelect') return;
    const li = host.querySelector('.ixc[data-k="'+d.kind+'"][data-v="'+String(d.label==null?'':d.label).replace(/"/g,'')+'"]');
    if(li){ unselAll(); li.classList.add('sel'); sel={kind:d.kind,value:d.label}; }
  });
})();
