/* =========================================================
   upload.js — dataset ingestion (CSV / Excel / JSON)
   ========================================================= */

const Upload = (() => {

  function init({ onLoaded }){
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const progressWrap = document.getElementById('progressWrap');
    const progressFill = document.getElementById('progressFill');
    const progressLabel = document.getElementById('progressLabel');

    dropzone.addEventListener('click', () => fileInput.click());

    ['dragenter','dragover'].forEach(evt =>
      dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add('drag'); }));
    ['dragleave','drop'].forEach(evt =>
      dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove('drag'); }));

    dropzone.addEventListener('drop', e => {
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });

    fileInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) handleFile(file);
    });

    document.getElementById('loadSampleBtn').addEventListener('click', () => {
      const sample = generateSample();
      onLoaded({ name: 'sample_customers.csv', rows: sample });
    });

    function setProgress(pct, label){
      progressWrap.classList.remove('hidden');
      progressFill.style.width = pct + '%';
      progressLabel.textContent = label;
      if (pct >= 100) setTimeout(() => progressWrap.classList.add('hidden'), 500);
    }

    function handleFile(file){
      const ext = file.name.split('.').pop().toLowerCase();
      setProgress(15, 'Reading file…');

      if (ext === 'csv'){
        Papa.parse(file, {
          header: true, dynamicTyping: true, skipEmptyLines: true,
          complete: (res) => {
            setProgress(100, 'Done');
            onLoaded({ name: file.name, rows: cleanRows(res.data) });
          },
          error: () => { setProgress(100,'Error'); alert('Could not parse CSV file.'); }
        });
      } else if (ext === 'xlsx' || ext === 'xls'){
        const reader = new FileReader();
        reader.onprogress = (e) => { if (e.lengthComputable) setProgress(15 + (e.loaded/e.total)*60, 'Reading Excel…'); };
        reader.onload = (e) => {
          setProgress(85, 'Parsing sheet…');
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
          setProgress(100, 'Done');
          onLoaded({ name: file.name, rows: cleanRows(json) });
        };
        reader.readAsArrayBuffer(file);
      } else if (ext === 'json'){
        const reader = new FileReader();
        reader.onload = (e) => {
          setProgress(90, 'Parsing JSON…');
          try{
            let json = JSON.parse(e.target.result);
            if (!Array.isArray(json)) json = json.data || json.rows || [json];
            setProgress(100, 'Done');
            onLoaded({ name: file.name, rows: cleanRows(json) });
          }catch(err){
            setProgress(100,'Error'); alert('Could not parse JSON file.');
          }
        };
        reader.readAsText(file);
      } else {
        alert('Unsupported file type. Please upload CSV, XLSX, XLS or JSON.');
      }
    }

    function cleanRows(rows){
      return rows.filter(r => r && Object.keys(r).length && Object.values(r).some(v => v !== '' && v !== null));
    }
  }

  function generateSample(){
    const countries = ['USA','India','Germany','Brazil','Japan','Canada'];
    const genders = ['Male','Female'];
    const rows = [];
    for (let i=0;i<300;i++){
      const age = Math.round(18 + Math.random()*50);
      const income = Math.round(20000 + Math.random()*120000 + age*400);
      rows.push({
        CustomerID: 1000+i,
        Age: Math.random() < 0.04 ? '' : age,
        Gender: genders[Math.floor(Math.random()*genders.length)],
        Country: countries[Math.floor(Math.random()*countries.length)],
        Income: Math.random() < 0.06 ? '' : income,
        Tenure: Math.round(Math.random()*10),
        Purchases: Math.round(Math.random()* (income/5000)),
        Churned: Math.random() < 0.22 ? 1 : 0
      });
    }
    // inject a few duplicates and outliers
    rows.push({...rows[3]});
    rows.push({...rows[10]});
    rows[15].Income = 980000;
    rows[42].Age = 117;
    return rows;
  }

  function renderPreview(data, columns){
    const wrap = document.getElementById('previewWrap');
    const meta = document.getElementById('previewMeta');
    const table = document.getElementById('previewTable');
    wrap.classList.remove('hidden');
    meta.textContent = `— ${data.length.toLocaleString()} rows × ${columns.length} columns (showing first 15)`;

    const thead = `<thead><tr>${columns.map(c=>`<th>${c}</th>`).join('')}</tr></thead>`;
    const body = data.slice(0,15).map(r =>
      `<tr>${columns.map(c => `<td>${r[c] === '' || r[c]===undefined || r[c]===null ? '<span class="muted">—</span>' : r[c]}</td>`).join('')}</tr>`
    ).join('');
    table.innerHTML = thead + `<tbody>${body}</tbody>`;
  }

  return { init, renderPreview };
})();
