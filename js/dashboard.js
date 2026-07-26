/* =========================================================
   dashboard.js — application state & controller
   ========================================================= */

(() => {
  const state = {
    fileName: null,
    data: [],
    columns: [],
    types: {},
    target: '',
    history: [],
    theme: 'dark'
  };

  const THEME_ORDER = ['dark','light','glass','material'];
  const THEME_LABEL = { dark:'Dark', light:'Light', glass:'Glass', material:'Material' };

  /* ---------------- navigation ---------------- */
  function switchView(name){
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('view-' + name).classList.add('active');
    document.querySelector(`.nav-item[data-view="${name}"]`).classList.add('active');
    renderView(name);
  }

  function renderView(name){
    switch(name){
      case 'overview': renderOverview(); break;
      case 'missing': renderMissing(); break;
      case 'outliers': renderOutliers(); break;
      case 'correlation': renderCorrelation(); break;
      case 'stats': renderStatsView(); break;
      case 'visualize': renderVisualizeControls(); break;
      case 'clean': renderClean(); break;
      case 'feature': renderFeature(); break;
      case 'ml': renderML(); break;
      case 'chat': renderChatSuggestions(); break;
    }
  }

  /* ---------------- history log ---------------- */
  function pushHistory(label){
    state.history.unshift({ time: new Date().toLocaleTimeString(), label });
    const list = document.getElementById('historyList');
    list.innerHTML = state.history.slice(0,40).map(h => `<li><b>${h.label}</b>${h.time}</li>`).join('');
  }

  /* ---------------- dataset loading / recompute ---------------- */
  function loadDataset({ name, rows }){
    state.fileName = name;
    state.data = rows;
    state.columns = Object.keys(rows[0] || {});
    state.target = '';
    pushHistory(`Uploaded ${name} (${rows.length} rows)`);
    recompute();
    Upload.renderPreview(state.data, state.columns);
    switchView('overview');
  }

  function recompute(){
    state.types = Stats.inferColumnTypes(state.data, state.columns);
    updateReadout();
    populateColumnSelectors();
  }

  function updateReadout(){
    if (!state.data.length) return;
    const p = Stats.profile(state.data, state.columns, state.types);
    const q = Stats.dataQuality(p);
    document.getElementById('roRows').textContent = p.rows.toLocaleString();
    document.getElementById('roCols').textContent = p.cols;
    document.getElementById('roMissing').textContent = Utils.formatPct(p.missingPct);
    document.getElementById('roDupes').textContent = p.duplicates;
    document.getElementById('roNumeric').textContent = p.numericCols.length;
    document.getElementById('roCategorical').textContent = p.categoricalCols.length;
    document.getElementById('roHealth').textContent = q.score + '%';
  }

  function ctxBundle(){
    const profile = Stats.profile(state.data, state.columns, state.types);
    const missing = Stats.missingReport(state.data, state.columns);
    const outliers = Stats.outlierReport(state.data, profile.numericCols);
    const quality = Stats.dataQuality(profile);
    const mlTask = Stats.suggestMLTask(state.data, state.target, state.types, state.columns);
    const importance = Stats.featureImportance(state.data, state.target, state.columns, state.types);
    return { profile, missing, outliers, quality, mlTask, importance, columns: state.columns, target: state.target };
  }

  /* ---------------- selectors ---------------- */
  function populateColumnSelectors(){
    const numeric = state.columns.filter(c => state.types[c] === 'numeric');
    const all = state.columns;

    setOptions('vizColX', all);
    setOptions('vizColY', numeric.length ? numeric : all);
    setOptions('cleanCol', all);
    setOptions('feRatioA', numeric);
    setOptions('feRatioB', numeric);
    setOptions('feLogCol', numeric);
    setOptions('fePolyCol', numeric);
    setOptions('targetSelect', all, true);
  }

  function setOptions(id, values, withEmpty){
    const sel = document.getElementById(id);
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = (withEmpty ? '<option value="">— none / unsupervised —</option>' : '') +
      values.map(v => `<option value="${v}">${v}</option>`).join('');
    if (values.includes(current)) sel.value = current;
  }

  /* ---------------- OVERVIEW ---------------- */
  function renderOverview(){
    if (!state.data.length) return;
    const { profile, quality } = ctxBundle();
    const cards = document.getElementById('profileCards');
    cards.innerHTML = [
      ['Rows', profile.rows.toLocaleString()],
      ['Columns', profile.cols],
      ['Missing cells', `${profile.missingCells} (${Utils.formatPct(profile.missingPct)})`],
      ['Duplicate rows', profile.duplicates],
      ['Numeric columns', profile.numericCols.length],
      ['Categorical columns', profile.categoricalCols.length],
      ['Memory usage', Utils.bytesToSize(profile.memoryBytes)],
    ].map(([label,value]) => `
      <div class="stat-card">
        <div class="label">${label}</div>
        <div class="value ${label==='Duplicate rows' && value>0 ? 'warn':''}">${value}</div>
      </div>`).join('');

    const circumference = 327;
    const offset = circumference - (quality.score/100)*circumference;
    document.getElementById('qualityRing').style.strokeDashoffset = offset;
    document.getElementById('qualityNum').textContent = quality.score + '%';
    document.getElementById('qualityBreakdown').innerHTML = Object.entries(quality.breakdown)
      .map(([k,v]) => `<li>${k} <b>${Utils.formatPct(v)}</b></li>`).join('');

    const missing = Stats.missingReport(state.data, state.columns);
    const outliers = Stats.outlierReport(state.data, profile.numericCols);
    document.getElementById('aiSuggestions').innerHTML = AI.suggestions(profile, missing, outliers, state.types)
      .map(t => `<li>${t}</li>`).join('');
  }

  /* ---------------- MISSING ---------------- */
  function renderMissing(){
    if (!state.data.length) return;
    const report = Stats.missingReport(state.data, state.columns);
    const table = document.getElementById('missingTable');
    table.innerHTML = `<thead><tr><th>Column</th><th>Type</th><th>Missing</th><th>Severity</th><th>Suggested action</th></tr></thead><tbody>` +
      report.map(r => {
        const sevClass = r.pct > 0.2 ? 'high' : r.pct > 0.05 ? 'mid' : '';
        const action = r.pct === 0 ? 'None needed' : state.types[r.col] === 'numeric' ? 'Mean / median imputation' : 'Mode imputation or drop';
        return `<tr>
          <td>${r.col}</td><td class="muted">${state.types[r.col]}</td>
          <td class="num">${r.missing}</td>
          <td><span class="sev-cell"><span class="sev-bar ${sevClass}"><i style="width:${Math.min(100,r.pct*100)}%"></i></span>${Utils.formatPct(r.pct)}</span></td>
          <td class="muted">${action}</td>
        </tr>`;
      }).join('') + '</tbody>';
  }

  /* ---------------- OUTLIERS ---------------- */
  function renderOutliers(){
    if (!state.data.length) return;
    const profile = Stats.profile(state.data, state.columns, state.types);
    const reports = Stats.outlierReport(state.data, profile.numericCols);
    const grid = document.getElementById('outlierBoxes');
    if (!reports.length){ grid.innerHTML = '<p class="muted">No numeric columns detected.</p>'; return; }
    grid.innerHTML = reports.map(r => `
      <div class="box-card">
        <h4>${r.col}</h4>
        ${Charts.renderBoxSVG(r)}
        <div class="box-count">${r.outliers.length} outlier${r.outliers.length===1?'':'s'} · IQR [${r.lower.toFixed(1)}, ${r.upper.toFixed(1)}]</div>
      </div>`).join('');
  }

  /* ---------------- CORRELATION ---------------- */
  function renderCorrelation(){
    if (!state.data.length) return;
    const profile = Stats.profile(state.data, state.columns, state.types);
    const matrix = Stats.correlationMatrix(state.data, profile.numericCols);
    Charts.renderCorrHeatmap(matrix, profile.numericCols, (a,b,v) => {
      document.getElementById('corrDetail').innerHTML =
        `<b>${a}</b> vs <b>${b}</b>: correlation coefficient = <b class="mono">${v.toFixed(3)}</b> — ${
          Math.abs(v) > 0.7 ? 'strong' : Math.abs(v) > 0.3 ? 'moderate' : 'weak'} ${v >= 0 ? 'positive' : 'negative'} relationship.`;
    });
  }

  /* ---------------- STATISTICS ---------------- */
  function renderStatsView(){
    if (!state.data.length) return;
    const table = document.getElementById('statsTable');
    const rowsHtml = state.columns.map(col => {
      const s = Stats.columnStats(state.data, col, state.types[col]);
      if (s.type === 'numeric'){
        return `<tr data-col="${col}"><td>${col}</td><td class="muted">numeric</td>
          <td class="num">${Utils.formatNum(s.mean)}</td><td class="num">${Utils.formatNum(s.median)}</td>
          <td class="num">${Utils.formatNum(s.mode)}</td><td class="num">${Utils.formatNum(s.std)}</td>
          <td class="num">${Utils.formatNum(s.variance)}</td><td class="num">${Utils.formatNum(s.skewness)}</td>
          <td class="num">${Utils.formatNum(s.kurtosis)}</td><td class="num">${Utils.formatNum(s.min)}</td>
          <td class="num">${Utils.formatNum(s.max)}</td></tr>`;
      }
      return `<tr data-col="${col}"><td>${col}</td><td class="muted">categorical</td>
        <td colspan="7" class="muted">${s.unique} unique values</td>
        <td class="num" colspan="2">mode: ${s.mode} (${s.modeFreq})</td></tr>`;
    }).join('');
    table.innerHTML = `<thead><tr><th>Column</th><th>Type</th><th>Mean</th><th>Median</th><th>Mode</th>
      <th>Std Dev</th><th>Variance</th><th>Skewness</th><th>Kurtosis</th><th>Min</th><th>Max</th></tr></thead><tbody>${rowsHtml}</tbody>`;
  }

  /* ---------------- VISUALIZE ---------------- */
  function renderVisualizeControls(){
    if (!state.data.length) return;
    document.getElementById('vizColYWrap').style.display =
      document.getElementById('vizType').value === 'scatter' ? 'block' : 'none';
  }

  function renderChart(){
    const type = document.getElementById('vizType').value;
    const colX = document.getElementById('vizColX').value;
    const colY = document.getElementById('vizColY').value;
    Charts.renderChart(type, state.data, colX, colY, state.types);
  }

  /* ---------------- CLEAN ---------------- */
  function renderClean(){
    if (!state.data.length) return;
    renderMiniTable('cleanPreviewTable');
  }

  function renderMiniTable(id){
    const table = document.getElementById(id);
    const cols = state.columns.slice(0,10);
    table.innerHTML = `<thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>` +
      state.data.slice(0,10).map(r => `<tr>${cols.map(c => `<td>${Utils.isMissing(r[c]) ? '<span class="muted">—</span>' : r[c]}</td>`).join('')}</tr>`).join('') +
      '</tbody>';
  }

  function applyTransform(fn, label){
    state.data = fn(state.data);
    state.columns = Object.keys(state.data[0] || {});
    pushHistory(label);
    recompute();
    renderClean();
    renderFeature();
  }

  /* ---------------- FEATURE ENGINEERING ---------------- */
  function renderFeature(){
    if (!state.data.length) return;
    renderMiniTable('fePreviewTable');
  }

  /* ---------------- ML ADVISOR ---------------- */
  function renderML(){
    if (!state.data.length) return;
    const mlTask = Stats.suggestMLTask(state.data, state.target, state.types, state.columns);
    document.getElementById('mlTaskSuggestion').textContent = mlTask.task;
    document.getElementById('mlTaskReason').textContent = mlTask.reason;

    const importance = Stats.featureImportance(state.data, state.target, state.columns, state.types);
    const fiWrap = document.getElementById('featureImportance');
    fiWrap.innerHTML = importance.length ? importance.map(f => `
      <div class="fi-row">
        <span>${f.col}</span>
        <div class="fi-track"><div class="fi-fill" style="width:${(f.importance*100).toFixed(0)}%"></div></div>
        <span class="mono">${(f.importance*100).toFixed(0)}%</span>
      </div>`).join('') : '<p class="muted">Select a target variable to estimate feature importance.</p>';

    const rows = Stats.modelComparison(mlTask.task);
    document.getElementById('modelCompareTable').innerHTML =
      `<thead><tr><th>Algorithm</th><th>Typical accuracy</th><th>Speed</th><th>Complexity</th></tr></thead><tbody>` +
      rows.map(r => `<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('') + '</tbody>';
  }

  /* ---------------- CHAT ---------------- */
  function appendChat(text, who){
    const win = document.getElementById('chatWindow');
    const msg = Utils.el('div', `chat-msg ${who}`, text);
    win.appendChild(msg);
    win.scrollTop = win.scrollHeight;
  }

  function renderChatSuggestions(){
    const chips = ['Why is Age important?', 'Explain correlation', 'How much data is missing?', 'Any outliers?', 'What model should I use?'];
    document.getElementById('chatSuggestions').innerHTML = chips.map(c => `<span class="chip">${c}</span>`).join('');
    document.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
      document.getElementById('chatInput').value = chip.textContent;
      sendChat();
    }));
  }

  function sendChat(){
    const input = document.getElementById('chatInput');
    const query = input.value.trim();
    if (!query || !state.data.length) return;
    appendChat(query, 'user');
    input.value = '';
    const ctx = ctxBundle();
    setTimeout(() => appendChat(AI.answer(query, ctx), 'bot'), 200);
  }

  /* ---------------- SMART SEARCH ---------------- */
  function smartSearch(query){
    const box = document.getElementById('searchResults');
    if (!query){ box.classList.add('hidden'); return; }
    const matches = state.columns.filter(c => c.toLowerCase().includes(query.toLowerCase()));
    if (!matches.length){ box.innerHTML = '<div class="muted">No matching columns</div>'; box.classList.remove('hidden'); return; }
    box.innerHTML = matches.map(m => `<div data-col="${m}">${m} <span class="muted">— ${state.types[m]}</span></div>`).join('');
    box.classList.remove('hidden');
    box.querySelectorAll('div[data-col]').forEach(d => d.addEventListener('click', () => {
      switchView('stats');
      box.classList.add('hidden');
      document.getElementById('smartSearch').value = '';
      setTimeout(() => {
        const row = document.querySelector(`#statsTable tr[data-col="${d.dataset.col}"]`);
        if (row){ row.scrollIntoView({behavior:'smooth', block:'center'}); row.style.background = 'var(--bg-raised)'; }
      }, 50);
    }));
  }

  /* ---------------- THEME ---------------- */
  function cycleTheme(){
    const idx = THEME_ORDER.indexOf(state.theme);
    state.theme = THEME_ORDER[(idx+1) % THEME_ORDER.length];
    document.documentElement.setAttribute('data-theme', state.theme);
    document.getElementById('themeLabel').textContent = THEME_LABEL[state.theme];
    if (document.getElementById('view-correlation').classList.contains('active')) renderCorrelation();
  }

  /* ---------------- EXPORT ---------------- */
  function exportCSV(){
    if (!state.data.length) return;
    const cols = state.columns;
    const csvRows = [cols.join(',')].concat(
      state.data.map(r => cols.map(c => {
        const v = r[c] === undefined || r[c] === null ? '' : String(r[c]).replace(/"/g,'""');
        return /[,"\n]/.test(v) ? `"${v}"` : v;
      }).join(','))
    );
    Utils.downloadBlob(csvRows.join('\n'), (state.fileName || 'dataset').replace(/\.[^.]+$/,'') + '_cleaned.csv', 'text/csv');
    pushHistory('Exported cleaned CSV');
  }

  function generateReport(){
    if (!state.data.length) return;
    const ctx = ctxBundle();
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>DataMind Studio Report — ${state.fileName}</title>
      <style>
        body{font-family:-apple-system,Segoe UI,sans-serif; padding:40px; color:#12172B;}
        h1{margin-bottom:0;} .muted{color:#666;}
        table{border-collapse:collapse; width:100%; margin:16px 0; font-size:13px;}
        th,td{border:1px solid #ddd; padding:6px 10px; text-align:left;}
        th{background:#f2f2f2;}
        .score{font-size:40px; font-weight:bold; color:#2a9d8f;}
      </style></head><body>
      <h1>DataMind Studio — Dataset Report</h1>
      <p class="muted">File: ${state.fileName} · Generated ${new Date().toLocaleString()}</p>
      <h2>Quality score</h2>
      <div class="score">${ctx.quality.score}/100</div>
      <h2>Profile</h2>
      <table>
        <tr><th>Rows</th><td>${ctx.profile.rows}</td></tr>
        <tr><th>Columns</th><td>${ctx.profile.cols}</td></tr>
        <tr><th>Missing cells</th><td>${ctx.profile.missingCells} (${Utils.formatPct(ctx.profile.missingPct)})</td></tr>
        <tr><th>Duplicate rows</th><td>${ctx.profile.duplicates}</td></tr>
        <tr><th>Numeric columns</th><td>${ctx.profile.numericCols.join(', ')}</td></tr>
        <tr><th>Categorical columns</th><td>${ctx.profile.categoricalCols.join(', ')}</td></tr>
      </table>
      <h2>AI recommendations</h2>
      <ul>${AI.suggestions(ctx.profile, ctx.missing, ctx.outliers, state.types).map(t=>`<li>${t}</li>`).join('')}</ul>
      <h2>ML recommendation</h2>
      <p><b>${ctx.mlTask.task}</b> — ${ctx.mlTask.reason}</p>
      <script>window.onload = () => window.print();</script>
      </body></html>`);
    win.document.close();
    pushHistory('Generated printable report');
  }

  /* ---------------- INIT ---------------- */
  function init(){
    document.querySelectorAll('.nav-item').forEach(btn =>
      btn.addEventListener('click', () => switchView(btn.dataset.view)));

    Upload.init({ onLoaded: loadDataset });

    document.getElementById('themeToggle').addEventListener('click', cycleTheme);

    document.getElementById('historyToggle').addEventListener('click', () =>
      document.getElementById('historyDrawer').classList.toggle('hidden'));
    document.getElementById('closeHistory').addEventListener('click', () =>
      document.getElementById('historyDrawer').classList.add('hidden'));

    document.getElementById('smartSearch').addEventListener('input', e => smartSearch(e.target.value));
    document.addEventListener('click', e => {
      if (!e.target.closest('.search-wrap')) document.getElementById('searchResults').classList.add('hidden');
    });

    document.getElementById('vizType').addEventListener('change', renderVisualizeControls);
    document.getElementById('vizRenderBtn').addEventListener('click', renderChart);

    document.getElementById('btnRemoveDupes').addEventListener('click', () =>
      applyTransform(Clean.removeDuplicates, 'Removed duplicate rows'));

    document.querySelectorAll('#view-clean .btn-row .btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const col = document.getElementById('cleanCol').value;
        if (!col) return;
        const action = btn.dataset.action;
        if (action === 'fillMean') applyTransform(d => Clean.fillMissing(d, col, 'mean'), `Filled mean in "${col}"`);
        if (action === 'fillMedian') applyTransform(d => Clean.fillMissing(d, col, 'median'), `Filled median in "${col}"`);
        if (action === 'fillMode') applyTransform(d => Clean.fillMissing(d, col, 'mode'), `Filled mode in "${col}"`);
        if (action === 'normalize') applyTransform(d => Clean.normalize(d, col), `Normalized "${col}"`);
        if (action === 'standardize') applyTransform(d => Clean.standardize(d, col), `Standardized "${col}"`);
        if (action === 'encode') applyTransform(d => Clean.encodeLabel(d, col), `Encoded "${col}"`);
        if (action === 'drop') applyTransform(d => Clean.dropColumn(d, col), `Dropped column "${col}"`);
      });
    });

    document.getElementById('feRatioBtn').addEventListener('click', () => {
      const a = document.getElementById('feRatioA').value, b = document.getElementById('feRatioB').value;
      if (!a || !b) return;
      applyTransform(d => Clean.createRatio(d, a, b, `${a}_per_${b}`), `Created ratio "${a}_per_${b}"`);
    });
    document.getElementById('feLogBtn').addEventListener('click', () => {
      const c = document.getElementById('feLogCol').value;
      if (!c) return;
      applyTransform(d => Clean.createLog(d, c, `log_${c}`), `Created "log_${c}"`);
    });
    document.getElementById('fePolyBtn').addEventListener('click', () => {
      const c = document.getElementById('fePolyCol').value;
      const deg = parseInt(document.getElementById('fePolyDegree').value, 10);
      if (!c) return;
      applyTransform(d => Clean.createPoly(d, c, deg, `${c}_pow${deg}`), `Created "${c}_pow${deg}"`);
    });

    document.getElementById('targetSelect').addEventListener('change', e => {
      state.target = e.target.value; renderML();
    });

    document.getElementById('chatSendBtn').addEventListener('click', sendChat);
    document.getElementById('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });

    document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);
    document.getElementById('exportReportBtn').addEventListener('click', generateReport);

    appendChat('Hi! Upload a dataset and ask me anything about it — missing values, outliers, correlation, or which model to try.', 'bot');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
