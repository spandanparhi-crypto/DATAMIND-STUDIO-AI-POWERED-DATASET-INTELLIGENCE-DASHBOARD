/* =========================================================
   charts.js — Chart.js visualizations + custom SVG plots
   ========================================================= */

const Charts = (() => {
  let mainChartInstance = null;

  function palette(){
    const style = getComputedStyle(document.documentElement);
    return {
      teal: style.getPropertyValue('--teal').trim(),
      amber: style.getPropertyValue('--amber').trim(),
      coral: style.getPropertyValue('--coral').trim(),
      violet: style.getPropertyValue('--violet').trim(),
      green: style.getPropertyValue('--green').trim(),
      text: style.getPropertyValue('--text').trim(),
      border: style.getPropertyValue('--border').trim(),
    };
  }

  function multiColors(n){
    const base = ['teal','amber','violet','coral','green'];
    const p = palette();
    const out = [];
    for (let i=0;i<n;i++) out.push(p[base[i % base.length]]);
    return out;
  }

  function destroyMain(){
    if (mainChartInstance){ mainChartInstance.destroy(); mainChartInstance = null; }
  }

  function renderChart(type, data, colX, colY, colType){
    const ctx = document.getElementById('mainChart').getContext('2d');
    destroyMain();
    const p = palette();
    const commonOpts = {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: p.text } } },
      scales: {
        x: { ticks: { color: p.text }, grid: { color: p.border } },
        y: { ticks: { color: p.text }, grid: { color: p.border } }
      }
    };

    if (type === 'histogram'){
      const values = Utils.toNumberArray(data, colX);
      const bins = 12;
      const min = Math.min(...values), max = Math.max(...values);
      const width = (max-min)/bins || 1;
      const counts = new Array(bins).fill(0);
      values.forEach(v => {
        let idx = Math.floor((v-min)/width);
        if (idx >= bins) idx = bins-1;
        if (idx < 0) idx = 0;
        counts[idx]++;
      });
      const labels = counts.map((_,i) => (min+i*width).toFixed(1));
      mainChartInstance = new Chart(ctx, {
        type:'bar',
        data:{ labels, datasets:[{ label: colX, data: counts, backgroundColor: p.teal }]},
        options: commonOpts
      });
      return;
    }

    if (type === 'bar' || type === 'line'){
      let labels, values;
      if (colType[colX] === 'categorical'){
        const counts = {};
        data.forEach(r => { if(!Utils.isMissing(r[colX])) counts[r[colX]] = (counts[r[colX]]||0)+1; });
        labels = Object.keys(counts); values = Object.values(counts);
      } else {
        labels = data.slice(0,50).map((_,i)=>i+1);
        values = Utils.toNumberArray(data.slice(0,50), colX);
      }
      mainChartInstance = new Chart(ctx, {
        type,
        data:{ labels, datasets:[{ label: colX, data: values, backgroundColor: p.teal, borderColor: p.violet, tension:.3 }]},
        options: commonOpts
      });
      return;
    }

    if (type === 'pie' || type === 'donut'){
      const counts = {};
      data.forEach(r => { if(!Utils.isMissing(r[colX])) counts[r[colX]] = (counts[r[colX]]||0)+1; });
      const labels = Object.keys(counts).slice(0,12);
      const values = labels.map(l => counts[l]);
      mainChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data:{ labels, datasets:[{ data: values, backgroundColor: multiColors(labels.length) }]},
        options: {
          responsive:true, maintainAspectRatio:false,
          cutout: type === 'donut' ? '60%' : '0%',
          plugins:{ legend: { position:'right', labels:{ color: p.text } } }
        }
      });
      return;
    }

    if (type === 'scatter'){
      const points = data
        .filter(r => !Utils.isMissing(r[colX]) && !Utils.isMissing(r[colY]))
        .map(r => ({ x: Number(r[colX]), y: Number(r[colY]) }));
      mainChartInstance = new Chart(ctx, {
        type: 'scatter',
        data:{ datasets:[{ label: `${colX} vs ${colY}`, data: points, backgroundColor: p.teal }]},
        options: commonOpts
      });
      return;
    }
  }

  function renderBoxSVG(stat){
    const { min, q1, median, q3, max } = stat;
    const w = 220, h = 70, pad = 12;
    const range = (max-min) || 1;
    const scale = v => pad + ((v-min)/range) * (w - pad*2);
    const p = palette();
    return `
    <svg viewBox="0 0 ${w} ${h}">
      <line x1="${scale(min)}" y1="${h/2}" x2="${scale(max)}" y2="${h/2}" stroke="${p.border}" stroke-width="2"/>
      <line x1="${scale(min)}" y1="${h/2-10}" x2="${scale(min)}" y2="${h/2+10}" stroke="${p.text}" stroke-width="2"/>
      <line x1="${scale(max)}" y1="${h/2-10}" x2="${scale(max)}" y2="${h/2+10}" stroke="${p.text}" stroke-width="2"/>
      <rect x="${scale(q1)}" y="${h/2-16}" width="${Math.max(2,scale(q3)-scale(q1))}" height="32" fill="${p.teal}" fill-opacity="0.35" stroke="${p.teal}" stroke-width="1.5"/>
      <line x1="${scale(median)}" y1="${h/2-16}" x2="${scale(median)}" y2="${h/2+16}" stroke="${p.amber}" stroke-width="2.5"/>
    </svg>`;
  }

  function renderCorrHeatmap(matrix, cols, onCellClick){
    const wrap = document.getElementById('corrHeatmap');
    if (!cols.length){ wrap.innerHTML = '<p class="muted">Need at least 2 numeric columns.</p>'; return; }
    let html = '<table class="corr-table"><thead><tr><th></th>' + cols.map(c=>`<th>${c}</th>`).join('') + '</tr></thead><tbody>';
    cols.forEach(rowCol => {
      html += `<tr><th>${rowCol}</th>`;
      cols.forEach(colCol => {
        const v = matrix[rowCol][colCol];
        html += `<td class="corr-cell" style="background:${Utils.colorForCorr(v)}" data-a="${rowCol}" data-b="${colCol}" data-v="${v}">${v.toFixed(2)}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
    wrap.querySelectorAll('.corr-cell').forEach(cell => {
      cell.addEventListener('click', () => onCellClick(cell.dataset.a, cell.dataset.b, parseFloat(cell.dataset.v)));
    });
  }

  return { renderChart, renderBoxSVG, renderCorrHeatmap, destroyMain };
})();
