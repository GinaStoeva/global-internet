/* script.js
   - Client-only app
   - Uses Globe.gl, PapaParse, Chart.js, topojson-client, d3-geo (CDNs)
*/

// -------------------- Config & state --------------------
const YEARS = ["2017","2018","2019","2020","2021","2022","2023","2024"];
let RAW = [];                    // parsed CSV rows
let WORLD_POINTS = [];           // points used by globe
let currentYear = "2024";
let currentRegion = "All";
let selectedCountry = null;
let playing = false;
let playTimer = null;
const restCacheKey = 'countryLatLngCache_v1';

// DOM
const yearSelect = document.getElementById('year-select');
const regionSelect = document.getElementById('region-select');
const topNInput = document.getElementById('top-n');
const countrySearch = document.getElementById('country-search');
const logsEl = document.getElementById('logs');
const topYearLbl = document.getElementById('top-year');
const playToggle = document.getElementById('play-toggle');
const csvUpload = document.getElementById('csv-upload');
const snapshotBtn = document.getElementById('download-snapshot');

// charts
let lineChart = null;
let pieChart = null;

// fill years
YEARS.forEach(y => {
  const opt = document.createElement('option'); opt.value = y; opt.textContent = y;
  yearSelect.append(opt);
});
yearSelect.value = currentYear;

// -------------------- Logging helper --------------------
function log(msg){
  const el = document.createElement('div');
  el.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logsEl.prepend(el);
}

// -------------------- CSV parsing --------------------
function parseCSVText(text){
  const parsed = Papa.parse(text.trim(), { header: true, dynamicTyping: true, skipEmptyLines: true });
  const rows = parsed.data.map(row => normalizeRow(row));
  RAW = rows;
  populateRegions();
  resolveAllLatLng(RAW).then(() => {
    buildWorldPoints();
    updateGlobePoints();
    updateChartsAndUI();
    log('CSV loaded and geocoding complete.');
  });
}

// Normalize row keys and numeric conversion
function normalizeRow(r){
  // unify column names: country, major_area, region, year 2017 .. year 2024
  const out = {};
  out.country = r.country || r.Country || r.name || r.CountryName || '';
  out.major_area = r.major_area || r.majorArea || r['major_area'] || r['major area'] || '';
  out.region = r.region || r.Region || r.REGION || '';
  // allow optional lat/lon columns if present
  out.lat = (r.lat !== undefined && r.lat !== '') ? Number(r.lat) : null;
  out.lon = (r.lon !== undefined && r.lon !== '') ? Number(r.lon) : null;
  for (const y of YEARS) {
    // accept headers like "year 2017" or "2017"
    const key = Object.keys(r).find(k => k && (k.includes(String(y))));
    out[y] = key ? (r[key] === null || r[key] === 'null' || r[key] === '' ? null : Number(r[key])) : null;
  }
  return out;
}

// -------------------- Geocoding (REST Countries fallback) --------------------
async function resolveLatLng(countryName){
  if(!countryName) return null;
  // a tiny normalize
  const key = countryName.trim().toLowerCase();
  // check session cache first
  let cache = JSON.parse(sessionStorage.getItem(restCacheKey) || '{}');
  if(cache[key]) return cache[key];

  // try REST Countries API (v3): https://restcountries.com/v3.1/name/{name}?fields=latlng,name
  try {
    const safeName = encodeURIComponent(countryName);
    const res = await fetch(`https://restcountries.com/v3.1/name/${safeName}?fields=name,latlng`, {cache:'force-cache'});
    if(!res.ok) throw new Error('not found');
    const arr = await res.json();
    const candidate = arr && arr[0];
    if(candidate && candidate.latlng && candidate.latlng.length >= 2) {
      const latlng = { lat: candidate.latlng[0], lon: candidate.latlng[1] };
      cache[key] = latlng;
      sessionStorage.setItem(restCacheKey, JSON.stringify(cache));
      return latlng;
    }
  } catch(e){
    // try small heuristic fallbacks
    // e.g. United States -> usa
    const alt = countryName.split(',')[0].split('(')[0].trim();
    if(alt && alt !== countryName){
      return resolveLatLng(alt);
    }
    // final fallback null
    return null;
  }
}

// Resolve lat/lon for all rows that are missing them (capped concurrency)
async function resolveAllLatLng(rows){
  const miss = rows.filter(r => (r.lat === null || r.lon === null) && r.country);
  if(miss.length === 0) return;
  log(`Resolving lat/lon for ${miss.length} countries (may take a few seconds)...`);
  // limit concurrency to avoid spamming API
  const concurrency = 6;
  let idx = 0;
  async function worker(){
    while(idx < miss.length){
      const i = idx++;
      const r = miss[i];
      const latlng = await resolveLatLng(r.country);
      if(latlng){
        r.lat = latlng.lat; r.lon = latlng.lon;
      } else {
        // final fallback: cluster by region with a random small offset
        const seed = (r.region || '').length;
        r.lat = (seed % 40) - 10 + (Math.random()-0.5)*6;
        r.lon = ((seed*13) % 180) - 60 + (Math.random()-0.5)*6;
      }
    }
  }
  await Promise.all(Array.from({length:concurrency}).map(()=>worker()));
}

// -------------------- Globe setup --------------------
const globeEl = document.getElementById('globe');
const globe = Globe()
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
  .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
  .backgroundColor('rgba(0,0,0,0)')
  .pointLat(d => d.lat)
  .pointLng(d => d.lon)
  .pointColor(d => colorForValue(d.value))
  .pointAltitude(d => 0.01 + (d.value/500))
  .pointRadius(d => Math.max(0.2, Math.log10(1 + Math.abs(d.value))/3))
  .pointsData([])
  .onPointHover(p => {
    // show a nice tooltip using browser title on hover
    if(p) document.body.style.cursor = 'pointer';
    else document.body.style.cursor = 'default';
  })
  .onPointClick(d => {
    selectedCountry = RAW.find(r => normalizeName(r.country) === normalizeName(d.country)) || null;
    updateLineChart(selectedCountry);
    log(`Clicked ${d.country} — ${d.value} Mbps`);
  });

globeEl.appendChild(globe.renderer().domElement);
globe.controls().autoRotate = true;
globe.controls().autoRotateSpeed = 0.35;

// -------------------- Helpers --------------------
function normalizeName(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }

function colorForValue(v){
  if(v === null || v === undefined) return 'rgba(120,120,120,0.6)';
  // good color ramp: low -> warm, high -> cyan
  const capped = Math.max(0, Math.min(400, v));
  const hue = 240 - (capped/400)*240; // 240..0
  return `hsl(${hue},85%,55%)`;
}

// -------------------- Build world points from RAW --------------------
function buildWorldPoints(){
  WORLD_POINTS = RAW
    .map(r => ({ country: r.country, region: r.region, lat: r.lat, lon: r.lon, value: (r[currentYear]!==null? r[currentYear]: null) }))
    .filter(p => p.lat !== null && p.lon !== null);
}

// update globe's points
function updateGlobePoints(){
  if(!WORLD_POINTS.length) buildWorldPoints();
  const filtered = WORLD_POINTS.filter(p => (currentRegion==='All' || p.region === currentRegion));
  globe.pointsData(filtered);
  updateBarRace(); // update top list
}

// -------------------- Charts --------------------
function ensureCharts(){
  // line chart (country trend)
  const lineCtx = document.getElementById('lineChart').getContext('2d');
  lineChart = new Chart(lineCtx, {
    type: 'line',
    data: { labels: YEARS, datasets: [{ label: 'Select a country', data: [], borderColor:'#60f3ff', backgroundColor:'rgba(96,243,255,0.06)', fill:true, tension:0.35 }]},
    options: { plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}}}
  });

  // pie chart (region share)
  const pieCtx = document.getElementById('pieChart')?.getContext('2d');
  if(pieCtx){
    pieChart = new Chart(pieCtx, {
      type: 'pie',
      data: { labels: [], datasets: [{ data: [], backgroundColor: []}]},
      options: { plugins:{legend:{position:'bottom'}}}
    });
  }
}

// update line chart for a selected country
function updateLineChart(row){
  if(!lineChart) ensureCharts();
  if(!row){
    lineChart.data.datasets[0].data = YEARS.map(_=>0);
    lineChart.data.datasets[0].label = 'No country selected';
  } else {
    const data = YEARS.map(y => (row[y] === null ? 0 : row[y]));
    lineChart.data.datasets[0].data = data;
    lineChart.data.datasets[0].label = row.country;
  }
  lineChart.update();
}

// update pie chart with region aggregates for current year
function updatePieChart(){
  if(!pieChart) ensureCharts();
  const groups = {};
  RAW.forEach(r => {
    const val = r[currentYear]; // may be null
    const key = r.region || 'Unknown';
    groups[key] = (groups[key] || 0) + (val || 0);
  });
  const labels = Object.keys(groups);
  pieChart.data.labels = labels;
  pieChart.data.datasets[0].data = labels.map(l=>groups[l]);
  pieChart.data.datasets[0].backgroundColor = labels.map((_,i) => `hsl(${(i*40)%360} 80% 60%)`);
  pieChart.update();
}

// -------------------- Top bar list (bar-race lightweight) --------------------
function updateBarRace(){
  const container = document.getElementById('bar-race');
  container.innerHTML = '';
  const topN = Math.max(3, Math.min(50, Number(document.getElementById('top-n').value || 12)));
  const list = RAW
    .filter(r => r[currentYear] !== null)
    .sort((a,b) => (b[currentYear]||0) - (a[currentYear]||0))
    .slice(0, topN);

  document.getElementById('top-year').textContent = currentYear;

  const max = list[0] ? list[0][currentYear] : 1;
  list.forEach((r, idx) => {
    const card = document.createElement('div');
    card.className = 'bar-item';
    card.innerHTML = `
      <div style="width:36px;text-align:right;font-weight:600">${idx+1}.</div>
      <div style="width:110px;font-weight:600">${r.country}</div>
      <div style="flex:1;margin-left:8px;margin-right:12px;background:rgba(255,255,255,0.04);height:12px;border-radius:8px;overflow:hidden">
        <div class="bar-fill" style="width:${Math.max(6, Math.round((r[currentYear]/max)*100))}%;"></div>
      </div>
      <div style="width:64px;text-align:right;font-weight:700">${(r[currentYear]||0).toFixed(2)} Mbps</div>
    `;
    card.onclick = () => {
      // center globe on country
      globe.pointOfView({ lat: r.lat, lng: r.lon, altitude: 1.5 }, 1200);
      updateLineChart(r);
      log(`Selected ${r.country} from top list`);
    };
    container.appendChild(card);
  });
}

// -------------------- UI wiring --------------------
yearSelect.addEventListener('change', e => {
  currentYear = e.target.value;
  buildWorldPoints();
  updateGlobePoints();
  updatePieChart();
  updateLineChart(selectedCountry);
  log(`Year changed to ${currentYear}`);
});

regionSelect.addEventListener('change', e => {
  currentRegion = e.target.value;
  updateGlobePoints();
  log(`Region filter: ${currentRegion}`);
});

topNInput.addEventListener('change', updateBarRace);

countrySearch.addEventListener('keydown', e => {
  if(e.key === 'Enter'){
    const q = e.target.value.trim();
    if(!q) return;
    // find best match
    const pick = RAW.find(r => normalizeName(r.country) === normalizeName(q) || normalizeName(r.country).includes(normalizeName(q)));
    if(!pick){
      alert('Country not found (try variations): ' + q);
      return;
    }
    globe.pointOfView({ lat: pick.lat, lng: pick.lon, altitude: 1.5 }, 1000);
    updateLineChart(pick);
    log(`Searched & focused: ${pick.country}`);
  }
});

// play toggle
playToggle.addEventListener('click', () => {
  playing = !playing;
  playToggle.textContent = playing ? 'Pause' : 'Play';
  if(playing){
    playTimer = setInterval(() => {
      // increment year
      const idx = YEARS.indexOf(currentYear);
      currentYear = YEARS[(idx + 1) % YEARS.length];
      yearSelect.value = currentYear;
      yearSelect.dispatchEvent(new Event('change'));
    }, 1200);
  } else {
    clearInterval(playTimer);
  }
});

// csv upload
csvUpload.addEventListener('change', e => {
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => parseCSVText(ev.target.result);
  reader.readAsText(file);
});

// snapshot (canvas)
snapshotBtn.addEventListener('click', async () => {
  // take screenshot of whole page via html2canvas? (we didn't import) — basic globe snapshot:
  try {
    const canvas = globe.renderer().domElement;
    canvas.toBlob(b => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `globe-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    log('Snapshot saved (globe canvas)');
  } catch (e) { log('Snapshot failed: ' + e.message); }
});

// -------------------- Boot: load default CSV (data.csv in repo) --------------------
async function boot(){
  ensureCharts();
  try {
    const res = await fetch('data.csv');
    const text = await res.text();
    parseCSVText(text);
  } catch(e){
    log('Failed to load data.csv from repo: ' + e.message);
  }
}
boot();
