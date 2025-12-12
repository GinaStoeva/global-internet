let rawData = [];
let globePoints = [];
let selectedCountry = null;
let currentYear = "2024";
let currentRegion = "All";

const years = ["2017","2018","2019","2020","2021","2022","2023","2024"];
const yearSelect = document.getElementById("year-select");
const regionSelect = document.getElementById("region-select");
const logsEl = document.getElementById("logs");

// Populate year dropdown
years.forEach(y => {
  const opt = document.createElement("option");
  opt.value = y;
  opt.textContent = y;
  yearSelect.appendChild(opt);
});

// Log function
function log(msg) {
  const li = document.createElement("li");
  li.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logsEl.prepend(li);
}

// Load CSV
function loadCSV(str) {
  const parsed = Papa.parse(str.trim(), {header:true, dynamicTyping:true}).data;
  rawData = parsed;

  // Populate region dropdown
  regionSelect.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "All";
  allOpt.textContent = "All Regions";
  regionSelect.appendChild(allOpt);

  const regions = new Set();
  rawData.forEach(r => regions.add(r.region));
  regions.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    regionSelect.appendChild(opt);
  });

  updateGlobePoints();
  log("CSV loaded successfully.");
}

// Convert CSV rows into globe points
function updateGlobePoints() {
  if (!rawData.length) return;

  globePoints = rawData
    .filter(r => r[`year ${currentYear}`] != null)
    .filter(r => currentRegion === "All" || r.region === currentRegion)
    .map(r => ({
      lat: Number(r.lat),
      lon: Number(r.lon),
      country: r.country,
      value: Number(r[`year ${currentYear}`])
    }));

  globeObj.pointsData(globePoints);
}

// Initialize the actual 3D globe
const globeObj = Globe()
  .globeImageUrl("https://unpkg.com/three-globe/example/img/earth-night.jpg")
  .bumpImageUrl("https://unpkg.com/three-globe/example/img/earth-topology.png")
  .pointLat(d => d.lat)
  .pointLng(d => d.lon)
  .pointLabel(d => `${d.country}: ${d.value} Mbps`)
  .pointColor(d => `hsl(${200 - d.value * 2}, 90%, 60%)`)
  .pointAltitude(d => 0.01 + d.value / 120)
  .pointRadius(0.45)
  .onPointClick(d => {
    selectedCountry = d.country;
    log(`Clicked ${d.country} – ${d.value} Mbps`);
  });

document.getElementById("globe-container")
  .appendChild(globeObj.renderer().domElement);

globeObj.controls().autoRotate = true;
globeObj.controls().autoRotateSpeed = 0.65;

// Event listeners
yearSelect.addEventListener("change", e => {
  currentYear = e.target.value;
  updateGlobePoints();
  log("Year changed to " + currentYear);
});

regionSelect.addEventListener("change", e => {
  currentRegion = e.target.value;
  updateGlobePoints();
  log("Region changed to " + currentRegion);
});

// Upload CSV manually
document.getElementById("csv-upload").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => loadCSV(ev.target.result);
  reader.readAsText(file);
});

// Load CSV from repo automatically
fetch("data.csv")
  .then(res => res.text())
  .then(text => loadCSV(text))
  .catch(() => log("data.csv missing"));

