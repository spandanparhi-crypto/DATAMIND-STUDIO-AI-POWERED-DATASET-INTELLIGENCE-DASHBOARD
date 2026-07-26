/* =========================================================
   clean.js — cleaning & feature engineering transforms
   All functions operate on (and return) a fresh array so the
   caller can push a new state and keep an undo trail if needed.
   ========================================================= */

const Clean = (() => {

  function removeDuplicates(data){
    const seen = new Set();
    return data.filter(r => {
      const key = JSON.stringify(r);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }

  function fillMissing(data, col, strategy){
    const values = Utils.toNumberArray(data, col);
    let fillValue;
    if (strategy === 'mean') fillValue = Utils.mean(values);
    else if (strategy === 'median') fillValue = Utils.median(values);
    else if (strategy === 'mode') fillValue = Utils.mode(data.map(r=>r[col]).filter(v=>!Utils.isMissing(v)));
    return data.map(r => {
      if (Utils.isMissing(r[col])){
        const copy = {...r}; copy[col] = fillValue; return copy;
      }
      return r;
    });
  }

  function normalize(data, col){
    const values = Utils.toNumberArray(data, col);
    const min = Math.min(...values), max = Math.max(...values);
    const range = (max - min) || 1;
    return data.map(r => {
      if (Utils.isMissing(r[col]) || !Utils.isNumeric(r[col])) return r;
      const copy = {...r}; copy[col] = Number((( Number(r[col]) - min) / range).toFixed(4)); return copy;
    });
  }

  function standardize(data, col){
    const values = Utils.toNumberArray(data, col);
    const m = Utils.mean(values), s = Utils.std(values) || 1;
    return data.map(r => {
      if (Utils.isMissing(r[col]) || !Utils.isNumeric(r[col])) return r;
      const copy = {...r}; copy[col] = Number(((Number(r[col]) - m) / s).toFixed(4)); return copy;
    });
  }

  function encodeLabel(data, col){
    const uniques = Utils.uniqueValues(data, col).sort();
    const map = Object.fromEntries(uniques.map((v,i) => [v, i]));
    return data.map(r => {
      const copy = {...r}; copy[col] = Utils.isMissing(r[col]) ? r[col] : map[r[col]]; return copy;
    });
  }

  function dropColumn(data, col){
    return data.map(r => { const copy = {...r}; delete copy[col]; return copy; });
  }

  function createRatio(data, colA, colB, newName){
    return data.map(r => {
      const copy = {...r};
      const a = Number(r[colA]), b = Number(r[colB]);
      copy[newName] = (Utils.isNumeric(a) && Utils.isNumeric(b) && b !== 0) ? Number((a/b).toFixed(4)) : '';
      return copy;
    });
  }

  function createLog(data, col, newName){
    return data.map(r => {
      const copy = {...r};
      const v = Number(r[col]);
      copy[newName] = (Utils.isNumeric(v) && v > 0) ? Number(Math.log(v).toFixed(4)) : '';
      return copy;
    });
  }

  function createPoly(data, col, degree, newName){
    return data.map(r => {
      const copy = {...r};
      const v = Number(r[col]);
      copy[newName] = Utils.isNumeric(v) ? Number(Math.pow(v, degree).toFixed(4)) : '';
      return copy;
    });
  }

  return {
    removeDuplicates, fillMissing, normalize, standardize, encodeLabel, dropColumn,
    createRatio, createLog, createPoly
  };
})();
