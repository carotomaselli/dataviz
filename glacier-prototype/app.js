/* Schweizer Gletscher als tropfende Eiszapfen – d3.js
   Daten: data.js (erzeugt von build_data.py aus GLAMOS-CSVs) */
(() => {
  const D = window.GLACIER_DATA;
  const G = D.glaciers, Y0 = D.y0, Y1 = D.y1, YO = D.yObsEnd;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Geometrie (viewBox-Einheiten) ----------
  const VB = { w: 1200, h: 650 };
  const P = { l: 84, r: 1164, t: 24, b: 600 };
  const W = P.r - P.l, H = P.b - P.t;

  const svg = d3.select('#chart').attr('viewBox', `0 0 ${VB.w} ${VB.h}`);

  // Zapfen nebeneinander, Breite ~ Fläche, Länge ~ Volumen (Wurzel-gedämpft)
  const wts = G.map(g => Math.pow(g.area0, 0.3));
  const wsum = d3.sum(wts), vmax = d3.max(G, g => g.v0);
  let acc = P.l;
  const hash = i => { const s = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return s - Math.floor(s); };
  G.forEach((g, i) => {
    g.x0 = acc; g.w = wts[i] / wsum * W; acc += g.w;
    g.tipOff = 0.28 + 0.44 * hash(i + 1);
    g.L0 = H * (0.42 + 0.5 * Math.pow(g.v0 / vmax, 0.2));
    g.drop = { t: hash(i + 7) * 2, state: 'hang', y: 0, vy: 0, hang: 2.5 };
  });

  // ---------- Zustand ----------
  let yearTarget = Y0, yearF = Y0, level = 0, selected = null, playing = false, lastStep = 0;
  const val = (arr, y) => {
    const c = Math.min(Math.max(y, Y0), Y1) - Y0, i = Math.floor(c), j = Math.min(i + 1, arr.length - 1);
    return arr[i] + (arr[j] - arr[i]) * (c - i);
  };
  const fmt = (n, d = 0) => n.toLocaleString('de-CH', { minimumFractionDigits: d, maximumFractionDigits: d }).replace('-', '−');
  const pct = x => Math.round(x * 100);

  // ---------- Zeichnen ----------
  svg.append('g').attr('class', 'axis')
    .selectAll('g').data([[1, '100%'], [0.5, '50%'], [0, '0%']]).join('g')
    .call(g => {
      g.append('text').attr('x', P.l - 10).attr('text-anchor', 'end')
        .attr('y', d => P.b - d[0] * H + (d[0] === 1 ? 14 : d[0] === 0 ? 0 : 5)).text(d => d[1]);
      g.append('line').attr('x1', P.l - 6).attr('x2', P.l).attr('y1', d => P.b - d[0] * H).attr('y2', d => P.b - d[0] * H)
        .attr('stroke', '#111');
    });

  const waterG = svg.append('g');
  const water = waterG.append('path').attr('fill', '#9fddfc');
  const waterLabel = svg.append('text').attr('class', 'waterlabel').attr('text-anchor', 'end').attr('x', P.r - 12);
  const rippleG = svg.append('g');
  const icicleG = svg.append('g');
  const dropG = svg.append('g');

  const ic = icicleG.selectAll('path').data(G, d => d.id).join('path')
    .attr('class', 'icicle').attr('tabindex', 0).attr('role', 'button')
    .attr('aria-label', d => `${d.name} auswählen`)
    .on('click', (e, d) => { e.stopPropagation(); select(selected === d.id ? null : d.id); })
    .on('keydown', (e, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(selected === d.id ? null : d.id); } })
    .on('pointerenter', (e, d) => showTip(e, d))
    .on('pointermove', (e, d) => showTip(e, d))
    .on('pointerleave', () => document.getElementById('tip').hidden = true)
    .on('focus', (e, d) => showTip(null, d))
    .on('blur', () => document.getElementById('tip').hidden = true);

  svg.on('click', () => select(null));
  addEventListener('keydown', e => { if (e.key === 'Escape') select(null); });

  const stageEl = document.querySelector('.stage'), tipEl = document.getElementById('tip');
  function showTip(e, d) {
    tipEl.hidden = false; tipEl.textContent = d.name;
    const r = stageEl.getBoundingClientRect(), sr = svg.node().getBoundingClientRect(), k = sr.width / VB.w;
    if (e) { tipEl.style.left = (e.clientX - r.left) + 'px'; tipEl.style.top = (e.clientY - r.top) + 'px'; }
    else { tipEl.style.left = (sr.left - r.left + (d.x0 + d.w * d.tipOff) * k) + 'px'; tipEl.style.top = (sr.top - r.top + (P.t + 40) * k) + 'px'; }
  }

  const iciclePath = (g, f) => {
    const L = g.L0 * f; if (L < 1.5) return '';
    const x0 = g.x0, x1 = g.x0 + g.w, tx = g.x0 + g.w * g.tipOff, ty = P.t + L, t = P.t;
    // leicht konkave Flanken – wie ein echter Eiszapfen
    const cl = [x0 + (tx - x0) * 0.4, t + L * 0.55], cr = [x1 + (tx - x1) * 0.4, t + L * 0.55];
    return `M${x0},${t}L${x1},${t}Q${cr[0]},${cr[1]} ${tx},${ty}Q${cl[0]},${cl[1]} ${x0},${t}Z`;
  };

  // ---------- Animation ----------
  const ripples = [];
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;

    if (playing && now - lastStep > 190) {
      lastStep = now;
      if (yearTarget >= Y1) setPlaying(false); else setYear(yearTarget + 1);
    }
    yearF += (yearTarget - yearF) * (REDUCED ? 1 : 1 - Math.exp(-dt * 7));
    if (Math.abs(yearTarget - yearF) < 0.002) yearF = yearTarget;

    level += (val(D.melted, yearF) - level) * (REDUCED ? 1 : 1 - Math.exp(-dt * 4));
    const surf = P.b - level * H;

    // Wasser
    let d = `M${P.l},${P.b}L${P.l},${surf}`;
    for (let x = P.l; x <= P.r + 1; x += 18) {
      const wy = REDUCED ? 0 : 2.4 * Math.sin(x * 0.021 + now * 0.0016) + 1.4 * Math.sin(x * 0.05 - now * 0.0023);
      d += `L${x},${level > 0.002 ? surf + wy : P.b}`;
    }
    water.attr('d', d + `L${P.r},${P.b}Z`);
    const inside = level * H > 40;
    waterLabel.attr('y', inside ? surf + 26 : surf - 10).text(level > 0.004 ? `${pct(level)} % geschmolzen` : '');

    // Zapfen + Tropfen
    ic.attr('d', g => iciclePath(g, val(g.f, yearF))).classed('sel', g => g.id === selected);
    svg.classed('has-sel', selected !== null);

    for (const g of G) {
      const f = val(g.f, yearF), s = g.drop, L = g.L0 * f;
      g.tipX = g.x0 + g.w * g.tipOff; g.tipY = P.t + L;
      const rate = Math.abs(val(g.ba, yearF));
      g.show = false;
      if (REDUCED || f < 0.01 || rate < 0.05 || g.tipY > surf - 3) continue;
      const period = 3.4 / Math.max(0.35, rate);
      if (s.state === 'hang') {
        s.t += dt;
        const k = Math.min(1, s.t / (period * 0.8));
        s.r = 1.2 + 4.8 * k * k;
        g.show = true; s.cy = g.tipY + s.r; s.sy = 1;
        if (k >= 1) { s.state = 'fall'; s.vy = 0; s.y = s.cy; }
      } else {
        s.vy += 1100 * dt; s.y += s.vy * dt;
        g.show = true; s.cy = s.y; s.sy = 1 + Math.min(0.9, s.vy / 900);
        if (s.y >= surf) {
          ripples.push({ x: g.tipX, y: surf, age: 0 });
          s.state = 'hang'; s.t = -Math.random() * 0.6;
        }
      }
    }
    dropG.selectAll('ellipse').data(G.filter(g => g.show), g => g.id).join('ellipse')
      .attr('class', 'drop').attr('cx', g => g.tipX).attr('cy', g => g.drop.cy)
      .attr('rx', g => g.drop.r || 4).attr('ry', g => (g.drop.r || 4) * g.drop.sy);

    for (const r of ripples) r.age += dt;
    while (ripples.length && ripples[0].age > 1.1) ripples.shift();
    rippleG.selectAll('ellipse').data(ripples).join('ellipse').attr('class', 'ripple')
      .attr('cx', r => r.x).attr('cy', r => r.y).attr('rx', r => 4 + r.age * 34).attr('ry', r => 1 + r.age * 6)
      .attr('opacity', r => 1 - r.age / 1.1);

    requestAnimationFrame(frame);
  }

  // ---------- Zeitstrahl ----------
  const yearEl = document.getElementById('year'), bubble = document.getElementById('yearBubble');
  const trackEl = document.querySelector('.track'), obsMark = document.getElementById('obsMark');
  const THUMB = 28;
  function placeLabels() {
    const w = yearEl.clientWidth, x = p => THUMB / 2 + p * (w - THUMB);
    bubble.style.left = x((yearTarget - Y0) / (Y1 - Y0)) + 'px';
    obsMark.style.left = x((YO - Y0) / (Y1 - Y0)) + 'px';
    trackEl.style.setProperty('--obs', x((YO - Y0) / (Y1 - Y0)) + 'px');
  }
  function setYear(y) {
    yearTarget = Math.max(Y0, Math.min(Y1, y)); yearEl.value = yearTarget;
    bubble.innerHTML = yearTarget + (yearTarget > YO ? '<small>Projektion</small>' : '');
    placeLabels(); updatePanel();
  }
  yearEl.addEventListener('input', () => { setPlaying(false); setYear(+yearEl.value); });
  yearEl.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); setPlaying(false); setYear(yearTarget + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setPlaying(false); setYear(yearTarget - 1); }
  });
  addEventListener('resize', placeLabels);

  const playBtn = document.getElementById('play'), playIcon = document.getElementById('playIcon');
  function setPlaying(on) {
    playing = on; lastStep = performance.now();
    playIcon.setAttribute('d', on ? 'M6 5h4v14H6zM14 5h4v14h-4z' : 'M8 5v14l11-7z');
    playBtn.setAttribute('aria-label', on ? 'Zeitraffer anhalten' : 'Zeitraffer abspielen');
  }
  playBtn.addEventListener('click', () => {
    if (!playing && yearTarget >= Y1) setYear(Y0);
    setPlaying(!playing);
  });

  // ---------- Seitenspalte: Übersicht (01) / Gletscher gewählt (02) ----------
  const panel = d3.select('#panel');
  function select(id) {
    selected = id; tipEl.hidden = true;
    buildPanel(); updatePanel();
  }

  function buildPanel() {
    panel.html('');
    if (!selected) {
      panel.html(`
        <h1>Schweizer Gletscher schmelzen</h1>
        <div class="big" id="ovBig">0 %</div>
        <p class="lead" id="ovLead"></p>
        <p class="small">Wähle einen Eiszapfen, um einen Gletscher genauer anzusehen.</p>
        <div class="legend">
          <span><i class="i-ice"></i>Gletscher (Länge = verbleibendes Eis)</span>
          <span><i class="i-water"></i>Schmelzwasser (Anteil am Eis von 2000)</span>
          <span><i class="i-proj"></i>Zeitstrahl gestrichelt: Projektion</span>
        </div>
        <p class="small">${G.length} Gletscher mit langen Messreihen. Quelle: ${D.source}. Ab 2026 wird der mittlere Trend von 2011–2025 fortgeschrieben, das ist keine Prognose.</p>`);
      return;
    }
    const g = G.find(x => x.id === selected);
    panel.html(`
      <button class="close" type="button" id="closeBtn">Zurück</button>
      <h2>${g.name}</h2>
      <div class="big" id="gBig">0 %</div>
      <p class="lead" id="gLead"></p>
      <svg class="spark" id="spark" viewBox="0 0 260 96" role="img" aria-label="Verlauf des verbleibenden Eisvolumens"></svg>
      <dl id="facts"></dl>`);
    document.getElementById('closeBtn').addEventListener('click', () => select(null));
    // Sparkline
    const sx = d3.scaleLinear([Y0, Y1], [4, 256]), sy = d3.scaleLinear([0, 1], [78, 6]);
    const s = d3.select('#spark');
    s.append('line').attr('x1', sx(YO)).attr('x2', sx(YO)).attr('y1', 4).attr('y2', 78).attr('stroke', '#bbb');
    s.append('line').attr('x1', 4).attr('x2', 256).attr('y1', 78).attr('y2', 78).attr('stroke', '#111');
    const line = d3.line().x((d, i) => sx(Y0 + i)).y(d => sy(d));
    s.append('path').attr('d', line(g.f.slice(0, YO - Y0 + 1))).attr('fill', 'none').attr('stroke', '#111').attr('stroke-width', 2);
    s.append('path').attr('d', d3.line().x((d, i) => sx(YO + i)).y(d => sy(d))(g.f.slice(YO - Y0)))
      .attr('fill', 'none').attr('stroke', '#111').attr('stroke-width', 2).attr('stroke-dasharray', '4 3');
    s.append('text').attr('x', 4).attr('y', 92).text('2000');
    s.append('text').attr('x', 256).attr('y', 92).attr('text-anchor', 'end').text('2100');
    s.append('text').attr('x', 256).attr('y', 14).attr('text-anchor', 'end').text('100 % = Eis von 2000');
    s.append('circle').attr('id', 'sparkDot').attr('r', 6).attr('fill', '#dd36fa');
    s.node()._sx = sx; s.node()._sy = sy;
  }

  function updatePanel() {
    const y = yearTarget, i = y - Y0;
    if (!selected) {
      const el = document.getElementById('ovBig'); if (!el) return;
      el.textContent = pct(D.melted[i]) + ' %';
      document.getElementById('ovLead').innerHTML =
        `des Eises dieser Gletscher ist bis ${y} geschmolzen${y > YO ? ' <span class="badge">Projektion</span>' : ''}.`;
      return;
    }
    const g = G.find(x => x.id === selected), f = g.f[i];
    document.getElementById('gBig').textContent = pct(f) + ' %';
    document.getElementById('gLead').innerHTML =
      f < 0.005 ? `Der Gletscher ist ${y} verschwunden${y > YO ? ' <span class="badge">Projektion</span>' : ''}.`
                : `des Eises von 2000 ist ${y} noch da${y > YO ? ' <span class="badge">Projektion</span>' : ''}.`;
    const sp = document.getElementById('spark');
    d3.select('#sparkDot').attr('cx', sp._sx(y)).attr('cy', sp._sy(f));

    const tot = d3.sum(G, h => h.v0 * (1 - h.f[i]));
    const share = tot > 0 ? g.v0 * (1 - f) / tot : 0;
    const lenYears = Object.keys(g.lengthCum).map(Number).filter(k => k <= y).sort((a, b) => a - b);
    const lenTxt = !Object.keys(g.lengthCum).length ? 'keine Messung in den Daten'
      : y <= Y0 ? '0 m'
      : lenYears.length ? `${fmt(g.lengthCum[lenYears.at(-1)])} m (bis ${lenYears.at(-1)})` : 'keine Messung';
    const geo = g.geo ? `${fmt(g.geo.dV, 3)} km³ zwischen ${g.geo.y0} und ${g.geo.y1} (Ø ${fmt(g.geo.dh, 1)} m Eisdicke)` : 'nicht verfügbar';
    document.getElementById('facts').innerHTML = `
      <div><dt>Fläche</dt><dd>${fmt(g.area0, 2)} km² (2000) → ${fmt(g.area[i], 2)} km² (${y})</dd></div>
      <div><dt>Ø Massenbilanz 2011–2025</dt><dd>${fmt(g.bTrend, 2)} m Wasseräquivalent pro Jahr</dd></div>
      <div><dt>Zungenrückzug seit 2000</dt><dd>${lenTxt}</dd></div>
      <div><dt>Geodätisch gemessener Volumenverlust</dt><dd>${geo}</dd></div>
      <div><dt>Anteil am Schmelzwasser</dt><dd>${pct(share)} %</dd></div>`;
  }

  // ---------- Start ----------
  buildPanel(); setYear(Y0);
  const q = new URLSearchParams(location.search);       // z. B. ?year=2050&glacier=B36-26
  if (q.get('year')) { setYear(+q.get('year')); yearF = yearTarget; level = val(D.melted, yearF); }
  if (q.get('glacier')) select(q.get('glacier'));
  requestAnimationFrame(frame);
})();
