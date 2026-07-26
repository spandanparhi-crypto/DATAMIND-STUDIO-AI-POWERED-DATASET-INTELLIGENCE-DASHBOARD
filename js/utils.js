/* =========================================================
   utils.js — shared helpers (math, formatting, DOM)
   ========================================================= */

const Utils = (() => {

  function isNumeric(v){
    if (v === null || v === undefined || v === '') return false;
    return !isNaN(v) && isFinite(v);
  }

  function isMissing(v){
    return v === null || v === undefined || v === '' ||
      (typeof v === 'string' && ['na','n/a','null','nan','-'].includes(v.trim().toLowerCase()));
  }

  function toNumberArray(data, col){
    return data
      .map(r => r[col])
      .filter(v => !isMissing(v) && isNumeric(v))
      .map(Number);
  }

  function mean(arr){ return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }

  function median(arr){
    if (!arr.length) return 0;
    const s = [...arr].sort((a,b)=>a-b);
    const mid = Math.floor(s.length/2);
    return s.length % 2 ? s[mid] : (s[mid-1]+s[mid])/2;
  }

  function mode(arr){
    if (!arr.length) return null;
    const counts = new Map();
    arr.forEach(v => counts.set(v, (counts.get(v)||0)+1));
    let best = arr[0], bestCount = 0;
    counts.forEach((c,v) => { if (c > bestCount){ best = v; bestCount = c; } });
    return best;
  }

  function variance(arr){
    if (arr.length < 2) return 0;
    const m = mean(arr);
    return arr.reduce((a,b)=> a + (b-m)**2, 0) / (arr.length - 1);
  }

  function std(arr){ return Math.sqrt(variance(arr)); }

  function skewness(arr){
    const n = arr.length;
    if (n < 3) return 0;
    const m = mean(arr), s = std(arr);
    if (s === 0) return 0;
    const sum = arr.reduce((a,b)=> a + ((b-m)/s)**3, 0);
    return (n / ((n-1)*(n-2))) * sum;
  }

  function kurtosis(arr){
    const n = arr.length;
    if (n < 4) return 0;
    const m = mean(arr), s = std(arr);
    if (s === 0) return 0;
    const sum = arr.reduce((a,b)=> a + ((b-m)/s)**4, 0);
    const term1 = (n*(n+1)) / ((n-1)*(n-2)*(n-3));
    const term2 = (3*(n-1)**2) / ((n-2)*(n-3));
    return term1*sum - term2;
  }

  function quantile(arr, q){
    if (!arr.length) return 0;
    const s = [...arr].sort((a,b)=>a-b);
    const pos = (s.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return s[base+1] !== undefined ? s[base] + rest*(s[base+1]-s[base]) : s[base];
  }

  function pearson(x, y){
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;
    const mx = mean(x.slice(0,n)), my = mean(y.slice(0,n));
    let num = 0, dx2 = 0, dy2 = 0;
    for (let i=0;i<n;i++){
      const dx = x[i]-mx, dy = y[i]-my;
      num += dx*dy; dx2 += dx*dx; dy2 += dy*dy;
    }
    const denom = Math.sqrt(dx2*dy2);
    return denom === 0 ? 0 : num/denom;
  }

  function uniqueValues(data, col){
    return [...new Set(data.map(r => r[col]).filter(v => !isMissing(v)))];
  }

  function formatNum(n, decimals=2){
    if (n === null || n === undefined || isNaN(n)) return '—';
    if (Math.abs(n) >= 1000) return Number(n.toFixed(0)).toLocaleString();
    return Number(n.toFixed(decimals)).toString();
  }

  function formatPct(n, decimals=1){
    return `${(n*100).toFixed(decimals)}%`;
  }

  function bytesToSize(bytes){
    if (bytes < 1024) return bytes + ' B';
    const units = ['KB','MB','GB'];
    let i = -1;
    do { bytes /= 1024; i++; } while (bytes >= 1024 && i < units.length-1);
    return bytes.toFixed(1) + ' ' + units[i];
  }

  function el(tag, cls, html){
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function downloadBlob(content, filename, type){
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function colorForCorr(v){
    // -1 -> coral, 0 -> neutral, +1 -> teal
    const abs = Math.abs(v);
    if (v >= 0){
      return `rgba(62, 207, 192, ${0.15 + abs*0.65})`;
    }
    return `rgba(255, 107, 107, ${0.15 + abs*0.65})`;
  }

  return {
    isNumeric, isMissing, toNumberArray, mean, median, mode, variance, std,
    skewness, kurtosis, quantile, pearson, uniqueValues, formatNum, formatPct,
    bytesToSize, el, downloadBlob, colorForCorr
  };
})();
