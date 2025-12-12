// ============================
// GLOBAL VARIABLES
// ============================
let rawData = null;
let globePoints = [];
let selectedCountry = null;
let currentYear = "2024";
let currentRegion = "All";

const years = ["2017","2018","2019","2020","2021","2022","2023","2024"];
const regionSet = new Set();

// DOM Elements
const yearSelect = document.getElementById("year-select");
const regionSelect = document.getElementById("region-select");
const logsEl = document.getElementById("logs");

// Populate year dropdown
years.forEach(y => yearSelect.innerHTML += `<option value="${y}">${y}</option>`);

// ============================
// LOG FUNCTION
// ============================
function log(msg){
  const li = document.createElement("li");
  li.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logsEl.prepend(li);
}

// ============================
// LOAD CSV
// ============================
function loadCSV(str){
  const parsed = Papa.parse(str.trim(), { header: true, dynamicTyping: true }).data;
  rawData = parsed;

  // populate region dropdown
  parsed.forEach(r => {
    if(r.region && !regionSet.has(r.region)){
      regionSet.add(r.region);
      regionSelect.innerHTML += `<option value="${r.region}">${r.region}</option>`;
    }
  });

  updateGlobePoints();
  updateCharts();
  log("CSV loaded successfully.");
}

// ============================
// UPDATE GLOBE POINTS
// ============================
function updateGlobePoints(){
  if(!rawData) return;
  globePoints = rawData
    .filter(r => r[`year ${currentYear}`] != null && (currentRegion==="All" || r.region===currentRegion))
    .map(r => ({
      lat: r.lat || Math.random()*140-70, // fallback if lat/lon missing
      lon: r.lon || Math.random()*360-180,
      value: r[`year ${currentYear}`],
      country: r.country,
      region: r.region
    }));
  if(window.globeObj) globeObj.pointsData(globePoints);
}

// ============================
// INIT GLOBE
// ============================
const globeObj = Globe()
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
  .pointLat(d => d.lat)
  .pointLng(d => d.lon)
  .pointColor(d => `hsl(${200 - d.value*2}, 80%, 60%)`)
  .pointAltitude(d => 0.02 + d.value/100)
  .pointRadius(0.5)
  .pointsData(globePoints)
  .onPointClick(d => {
    selectedCountry = d.country;
    updateCharts();
    log(`Clicked on ${d.country} (${d.region})`);
  })
  .backgroundColor('rgba(0,0,0,0)');

document.getElementById('globe').appendChild(globeObj.renderer().domElement);

// ============================
// CHARTS
// ============================
let lineChart = new Chart(document.getElementById("lineChart").getContext("2d"),{
  type: 'line',
  data: { labels: years, datasets: [{ label:"", data: [], borderColor:"#00e0ff", fill:false }] },
  options: { responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }
});

let pieChart = new Chart(document.getElementById("pieChart").getContext("2d"),{
  type: 'pie',
  data: { labels: [], datasets:[{ data: [], backgroundColor:[] }] },
  options:{ responsive:true }
});

function updateCharts(){
  if(!rawData) return;
  // LINE CHART
  if(selectedCountry){
    const countryData = rawData.find(r=>r.country===selectedCountry);
    lineChart.data.datasets[0].data = years.map(y => countryData[`year ${y}`] || 0);
    lineChart.data.datasets[0].label = selectedCountry;
    lineChart.update();
  }

  // PIE CHART by region for current year
  const filtered = rawData.filter(r => r[`year ${currentYear}`] != null && (currentRegion==="All"||r.region===currentRegion));
  pieChart.data.labels = filtered.map(r=>r.country);
  pieChart.data.datasets[0].data = filtered.map(r=>r[`year ${currentYear}`]);
  pieChart.data.datasets[0].backgroundColor = filtered.map((_,i)=>`hsl(${i*40},80%,60%)`);
  pieChart.update();
}

// ============================
// EVENT LISTENERS
// ============================
yearSelect.addEventListener("change", e=>{
  currentYear = e.target.value;
  updateGlobePoints();
  updateCharts();
  log(`Year changed to ${currentYear}`);
});

regionSelect.addEventListener("change", e=>{
  currentRegion = e.target.value;
  updateGlobePoints();
  updateCharts();
  log(`Region filtered: ${currentRegion}`);
});

document.getElementById("csv-upload").addEventListener("change", e=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => loadCSV(ev.target.result);
  reader.readAsText(file);
});

// ============================
// DEFAULT CSV LOADING
// ============================
fetch("data.csv")
  .then(res => res.text())
  .then(text => loadCSV(text));
