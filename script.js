let rawData = [];
let globePoints = [];
let selectedCountry = null;
let currentYear = "2024";
let currentRegion = "All";

const years = ["2017","2018","2019","2020","2021","2022","2023","2024"];
const yearSelect = document.getElementById("year-select");
const regionSelect = document.getElementById("region-select");
const logsEl = document.getElementById("logs");
const globeEl = document.getElementById("globe");

// Populate year dropdown
years.forEach(y => yearSelect.innerHTML += `<option value="${y}">${y}</option>`);

// Logging
function log(msg){
  const li = document.createElement("li");
  li.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logsEl.prepend(li);
}

// Load CSV data
function loadCSV(str){
  const parsed = Papa.parse(str.trim(), {header:true, dynamicTyping:true}).data;
  rawData = parsed;

  // Fill region dropdown
  const regions = new Set();
  rawData.forEach(r=>{ if(r.region) regions.add(r.region); });
  regions.forEach(r => regionSelect.innerHTML += `<option value="${r}">${r}</option>`);

  updateGlobePoints();
  log("CSV loaded");
}

// Update globe points
function updateGlobePoints(){
  if(!rawData.length) return;
  globePoints = rawData
    .filter(r => r[`year ${currentYear}`] != null && (currentRegion==="All" || r.region===currentRegion))
    .map((r,i)=>({
      lat: r.lat || Math.random()*140-70, // fallback if lat missing
      lon: r.lon || Math.random()*360-180, // fallback if lon missing
      value: r[`year ${currentYear}`],
      country: r.country
    }));
  if(globeObj) globeObj.pointsData(globePoints);
}

// Initialize globe
const globeObj = Globe()
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
  .pointLat(d=>d.lat)
  .pointLng(d=>d.lon)
  .pointColor(d=>`hsl(${200 - d.value*2},80%,60%)`)
  .pointAltitude(d=>0.01 + d.value/100)
  .pointRadius(0.5)
  .pointsData(globePoints)
  .onPointClick(d=>{
    selectedCountry=d.country;
    log(`Clicked ${d.country} - Value: ${d.value}`);
  });

globeEl.appendChild(globeObj.renderer().domElement);
globeObj.controls().autoRotate = true;
globeObj.controls().autoRotateSpeed = 0.6;

// Event listeners
yearSelect.addEventListener("change", e=>{
  currentYear = e.target.value;
  updateGlobePoints();
  log("Year: "+currentYear);
});

regionSelect.addEventListener("change", e=>{
  currentRegion = e.target.value;
  updateGlobePoints();
  log("Region: "+currentRegion);
});

document.getElementById("csv-upload").addEventListener("change", e=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => loadCSV(ev.target.result);
  reader.readAsText(file);
});

// Default CSV load from file in repo
fetch("data.csv")
  .then(res=>res.text())
  .then(text=>loadCSV(text));
