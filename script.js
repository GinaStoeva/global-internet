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

// populate year select
years.forEach(y => yearSelect.innerHTML += `<option value="${y}">${y}</option>`);

// logging
function log(msg){
  const li = document.createElement("li");
  li.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logsEl.prepend(li);
}

// load CSV
function loadCSV(str){
  const parsed = Papa.parse(str.trim(), {header:true, dynamicTyping:true}).data;
  rawData = parsed;

  // fill region dropdown
  const regions = new Set();
  rawData.forEach(r=>{ if(r.region) regions.add(r.region); });
  regions.forEach(r => regionSelect.innerHTML += `<option value="${r}">${r}</option>`);

  updateGlobePoints();
  log("CSV loaded");
}

// update globe points
function updateGlobePoints(){
  if(!rawData.length) return;
  globePoints = rawData
    .filter(r => r[`year ${currentYear}`]!=null && (currentRegion==="All" || r.region===currentRegion))
    .map((r,i)=>({
      lat: r.lat || Math.random()*140-70,
      lon: r.lon || Math.random()*360-180,
      value: r[`year ${currentYear}`],
      country: r.country
    }));
  if(globeObj) globeObj.pointsData(globePoints);
}

// initialize globe
const globeObj = Globe()
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  .pointLat(d=>d.lat)
  .pointLng(d=>d.lon)
  .pointColor(d=>`hsl(${200 - d.value*2},80%,60%)`)
  .pointAltitude(d=>0.01 + d.value/100)
  .pointRadius(0.5)
  .pointsData(globePoints)
  .onPointClick(d=>{
    selectedCountry=d.country;
    log(`Clicked ${d.country}`);
  });

globeEl.appendChild(globeObj.renderer().domElement);

// events
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

// default CSV load
fetch("data.csv")
  .then(res=>res.text())
  .then(text=>loadCSV(text));
