/* =========================================================
   ai.js — rule-based "AI" recommendations & chat assistant
   (No external AI calls — deterministic heuristics over the
   already-computed profile/stats so it always has an answer.)
   ========================================================= */

const AI = (() => {

  function suggestions(profileData, missing, outliers, types){
    const tips = [];

    if (profileData.duplicates > 0){
      tips.push(`Remove ${profileData.duplicates} duplicate row${profileData.duplicates>1?'s':''} — they can bias model training.`);
    }
    missing.filter(m => m.pct > 0).slice(0,4).forEach(m => {
      const strategy = types[m.col] === 'numeric' ? 'mean or median imputation' : 'mode imputation';
      tips.push(`Fill missing values in "${m.col}" (${Utils.formatPct(m.pct)} missing) using ${strategy}.`);
    });
    outliers.filter(o => o.outliers && o.outliers.length > 0).slice(0,3).forEach(o => {
      tips.push(`"${o.col}" has ${o.outliers.length} potential outlier${o.outliers.length>1?'s':''} outside the IQR range — review before scaling.`);
    });
    Object.keys(types).forEach(col => {
      if (types[col] === 'numeric') return;
    });
    const numericCols = profileData.numericCols || [];
    if (numericCols.length > 1){
      tips.push(`Consider normalizing or standardizing numeric columns (${numericCols.slice(0,3).join(', ')}${numericCols.length>3?'…':''}) before distance-based models.`);
    }
    const idLike = Object.keys(types).find(c => /id$/i.test(c) || /^id/i.test(c));
    if (idLike){
      tips.push(`"${idLike}" looks like an identifier column — consider dropping it before modeling, it carries no predictive signal.`);
    }
    if (!tips.length) tips.push('Dataset looks clean — no urgent preprocessing issues detected.');
    return tips;
  }

  function answer(query, ctx){
    const q = query.toLowerCase().trim();

    if (/why is .* important|feature importance|most important/i.test(q)){
      const colMatch = ctx.columns.find(c => q.includes(c.toLowerCase()));
      if (colMatch && ctx.importance.length){
        const found = ctx.importance.find(f => f.col === colMatch);
        if (found){
          return `"${colMatch}" has a relative importance score of ${(found.importance*100).toFixed(0)}/100 toward predicting "${ctx.target}". ` +
                 (found.importance > 0.6 ? 'It shows a strong relationship and is likely a key predictor.' :
                  found.importance > 0.3 ? 'It shows a moderate relationship — worth keeping in the model.' :
                  'It shows a weak relationship on its own, though it may still interact with other features.');
        }
      }
      if (ctx.importance.length){
        const top = ctx.importance[0];
        return `Based on the current target ("${ctx.target}"), "${top.col}" is estimated to be the most important feature. Open the ML Advisor tab and pick a target to see the full ranking.`;
      }
      return 'Select a target variable in the ML Advisor tab first — feature importance is calculated relative to a target.';
    }

    if (/explain correlation|what is correlation/i.test(q)){
      return 'Correlation measures how strongly two numeric columns move together, from -1 to +1. Values near +1 mean they rise together, near -1 means one rises as the other falls, and near 0 means little linear relationship. It does not imply causation.';
    }

    if (/missing/i.test(q)){
      const worst = ctx.missing[0];
      if (worst && worst.pct > 0){
        return `"${worst.col}" has the most missing data at ${Utils.formatPct(worst.pct)}. Overall, ${Utils.formatPct(ctx.profile.missingPct)} of all cells in the dataset are missing.`;
      }
      return 'This dataset currently has no missing values.';
    }

    if (/outlier/i.test(q)){
      const worst = ctx.outliers.filter(o=>o.outliers).sort((a,b)=>b.outliers.length-a.outliers.length)[0];
      if (worst && worst.outliers.length){
        return `"${worst.col}" has the most outliers (${worst.outliers.length}), detected using the IQR method — values outside [${worst.lower.toFixed(1)}, ${worst.upper.toFixed(1)}].`;
      }
      return 'No significant outliers were detected in the numeric columns.';
    }

    if (/duplicate/i.test(q)){
      return ctx.profile.duplicates > 0
        ? `There are ${ctx.profile.duplicates} duplicate rows. Use the Clean Data tab to remove them.`
        : 'No duplicate rows were found.';
    }

    if (/health|quality/i.test(q)){
      return `The dataset quality score is ${ctx.quality.score}/100, based on completeness, uniqueness, validity, consistency and accuracy proxies.`;
    }

    if (/rows|how many/i.test(q)){
      return `The dataset has ${ctx.profile.rows.toLocaleString()} rows and ${ctx.profile.cols} columns (${ctx.profile.numericCols.length} numeric, ${ctx.profile.categoricalCols.length} categorical).`;
    }

    if (/model|algorithm|which model/i.test(q)){
      return `For this dataset, the recommended task is "${ctx.mlTask.task}". ${ctx.mlTask.reason} Check the Model Comparison table in the ML Advisor tab for specific algorithms.`;
    }

    return `I can answer questions about missing values, outliers, correlation, duplicates, dataset quality, feature importance, or model recommendations — try asking about one of those, or explore the tabs on the left.`;
  }

  return { suggestions, answer };
})();
