/* =========================================================
   stats.js — profiling, statistics, outliers, correlation,
   data quality scoring, and ML task/feature recommendations
   ========================================================= */

const Stats = (() => {

  function inferColumnTypes(data, columns){
    const types = {};
    columns.forEach(col => {
      const values = data.map(r => r[col]).filter(v => !Utils.isMissing(v));
      if (!values.length){ types[col] = 'unknown'; return; }
      const numericCount = values.filter(v => Utils.isNumeric(v)).length;
      types[col] = (numericCount / values.length) > 0.85 ? 'numeric' : 'categorical';
    });
    return types;
  }

  function profile(data, columns, types){
    const rows = data.length;
    const cols = columns.length;
    let missingCells = 0;
    columns.forEach(c => data.forEach(r => { if (Utils.isMissing(r[c])) missingCells++; }));
    const totalCells = rows * cols || 1;

    const seen = new Set();
    let duplicates = 0;
    data.forEach(r => {
      const key = JSON.stringify(r);
      if (seen.has(key)) duplicates++; else seen.add(key);
    });

    const numericCols = columns.filter(c => types[c] === 'numeric');
    const categoricalCols = columns.filter(c => types[c] === 'categorical');
    const memoryBytes = new Blob([JSON.stringify(data)]).size;

    return {
      rows, cols, missingCells, missingPct: missingCells/totalCells,
      duplicates, numericCols, categoricalCols, memoryBytes
    };
  }

  function missingReport(data, columns){
    return columns.map(col => {
      const missing = data.filter(r => Utils.isMissing(r[col])).length;
      return { col, missing, pct: data.length ? missing/data.length : 0 };
    }).sort((a,b) => b.pct - a.pct);
  }

  function outlierReport(data, numericCols){
    return numericCols.map(col => {
      const values = Utils.toNumberArray(data, col);
      if (values.length < 4) return { col, values, q1:0, q3:0, min:0, max:0, median:0, outliers:[] };
      const q1 = Utils.quantile(values, 0.25);
      const q3 = Utils.quantile(values, 0.75);
      const iqr = q3 - q1;
      const lower = q1 - 1.5*iqr, upper = q3 + 1.5*iqr;
      const outliers = values.filter(v => v < lower || v > upper);
      return {
        col, values, q1, q3, iqr, lower, upper,
        min: Math.min(...values), max: Math.max(...values), median: Utils.median(values),
        outliers
      };
    });
  }

  function correlationMatrix(data, numericCols){
    const matrix = {};
    numericCols.forEach(a => {
      matrix[a] = {};
      const arrA = data.map(r => Utils.isMissing(r[a]) ? null : Number(r[a]));
      numericCols.forEach(b => {
        const arrB = data.map(r => Utils.isMissing(r[b]) ? null : Number(r[b]));
        const pairs = [];
        for (let i=0;i<data.length;i++){
          if (arrA[i] !== null && arrB[i] !== null && !isNaN(arrA[i]) && !isNaN(arrB[i])) pairs.push([arrA[i], arrB[i]]);
        }
        const x = pairs.map(p=>p[0]), y = pairs.map(p=>p[1]);
        matrix[a][b] = a === b ? 1 : Utils.pearson(x,y);
      });
    });
    return matrix;
  }

  function columnStats(data, col, type){
    if (type === 'numeric'){
      const values = Utils.toNumberArray(data, col);
      return {
        type, count: values.length,
        mean: Utils.mean(values), median: Utils.median(values), mode: Utils.mode(values),
        variance: Utils.variance(values), std: Utils.std(values),
        skewness: Utils.skewness(values), kurtosis: Utils.kurtosis(values),
        min: values.length ? Math.min(...values) : 0, max: values.length ? Math.max(...values) : 0,
        unique: new Set(values).size
      };
    }
    const values = data.map(r => r[col]).filter(v => !Utils.isMissing(v));
    const counts = {};
    values.forEach(v => counts[v] = (counts[v]||0)+1);
    const top = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
    return { type, count: values.length, unique: Object.keys(counts).length, mode: top ? top[0] : '—', modeFreq: top ? top[1] : 0 };
  }

  function dataQuality(profileData){
    const completeness = 1 - profileData.missingPct;
    const uniqueness = profileData.rows ? 1 - (profileData.duplicates/profileData.rows) : 1;
    const validity = 0.9; // proxy: no schema violations detectable client-side beyond type inference
    const consistency = profileData.numericCols.length + profileData.categoricalCols.length === profileData.cols ? 1 : 0.85;
    const accuracy = 0.92; // proxy score, cannot be verified without ground truth
    const score = (completeness*0.35 + uniqueness*0.25 + validity*0.15 + consistency*0.1 + accuracy*0.15);
    return {
      score: Math.round(score*100),
      breakdown: {
        Completeness: completeness, Uniqueness: uniqueness, Validity: validity,
        Consistency: consistency, Accuracy: accuracy
      }
    };
  }

  function featureImportance(data, target, columns, types){
    if (!target) return [];
    const candidates = columns.filter(c => c !== target);
    const targetNumeric = types[target] === 'numeric';
    const targetVals = targetNumeric ? Utils.toNumberArray(data, target) : null;

    const scored = candidates.map(col => {
      if (types[col] === 'numeric'){
        if (targetNumeric){
          const pairs = data.filter(r => !Utils.isMissing(r[col]) && !Utils.isMissing(r[target]));
          const x = pairs.map(r => Number(r[col])), y = pairs.map(r => Number(r[target]));
          return { col, importance: Math.abs(Utils.pearson(x,y)) };
        } else {
          // numeric feature vs categorical target: variance-ratio proxy (between-group / total)
          const groups = {};
          data.forEach(r => {
            if (Utils.isMissing(r[col]) || Utils.isMissing(r[target])) return;
            const g = r[target];
            (groups[g] = groups[g]||[]).push(Number(r[col]));
          });
          const all = Object.values(groups).flat();
          const grandMean = Utils.mean(all);
          let between = 0, total = Utils.variance(all) * (all.length-1);
          Object.values(groups).forEach(g => { between += g.length * (Utils.mean(g)-grandMean)**2; });
          const ratio = total > 0 ? between/ (total || 1) : 0;
          return { col, importance: Math.min(1, Math.abs(ratio)) };
        }
      } else {
        // categorical feature: normalized distinct-category signal proxy
        const uniqueRatio = Utils.uniqueValues(data, col).length / data.length;
        return { col, importance: Math.max(0, 0.5 - Math.abs(uniqueRatio-0.15)) };
      }
    });

    const max = Math.max(...scored.map(s=>s.importance), 0.0001);
    return scored.map(s => ({ col: s.col, importance: s.importance/max }))
      .sort((a,b) => b.importance - a.importance);
  }

  function suggestMLTask(data, target, types, columns){
    if (!target){
      return {
        task: 'Clustering',
        reason: 'No target variable selected — unsupervised techniques like K-Means or hierarchical clustering can reveal natural groupings in the data.'
      };
    }
    const type = types[target];
    if (type === 'categorical'){
      const uniqueCount = Utils.uniqueValues(data, target).length;
      if (uniqueCount === 2){
        return { task: 'Binary Classification', reason: `"${target}" has 2 distinct classes — logistic regression, random forest, or gradient boosting are strong starting points.` };
      }
      if (uniqueCount <= 15){
        return { task: 'Multi-class Classification', reason: `"${target}" has ${uniqueCount} distinct classes — tree-based ensembles (Random Forest, XGBoost) typically perform well.` };
      }
      return { task: 'NLP / Text Classification', reason: `"${target}" has many unique text-like values — consider treating this as an NLP problem (embeddings + classifier).` };
    }
    return { task: 'Regression', reason: `"${target}" is a continuous numeric variable — regression models (Linear Regression, Random Forest Regressor, XGBoost Regressor) are appropriate.` };
  }

  function modelComparison(task){
    const table = {
      'Binary Classification': [
        ['Logistic Regression','★★★','★★★★★','Low'],
        ['Random Forest','★★★★','★★★','Medium'],
        ['XGBoost','★★★★★','★★★★','High'],
        ['SVM','★★★★','★★','Medium'],
      ],
      'Multi-class Classification': [
        ['Random Forest','★★★★','★★★','Medium'],
        ['XGBoost','★★★★★','★★★★','High'],
        ['K-Nearest Neighbors','★★★','★★','Low'],
        ['Neural Network (MLP)','★★★★','★★','High'],
      ],
      'Regression': [
        ['Linear Regression','★★★','★★★★★','Low'],
        ['Random Forest Regressor','★★★★','★★★','Medium'],
        ['XGBoost Regressor','★★★★★','★★★★','High'],
        ['Ridge / Lasso','★★★','★★★★','Low'],
      ],
      'Clustering': [
        ['K-Means','★★★','★★★★','Low'],
        ['DBSCAN','★★★★','★★★','Medium'],
        ['Hierarchical Clustering','★★★','★★','Medium'],
        ['Gaussian Mixture','★★★★','★★★','High'],
      ],
      'NLP / Text Classification': [
        ['TF-IDF + Logistic Regression','★★★','★★★★','Low'],
        ['Naive Bayes','★★★','★★★★★','Low'],
        ['Fine-tuned Transformer','★★★★★','★','High'],
      ],
    };
    return table[task] || table['Clustering'];
  }

  return {
    inferColumnTypes, profile, missingReport, outlierReport, correlationMatrix,
    columnStats, dataQuality, featureImportance, suggestMLTask, modelComparison
  };
})();
