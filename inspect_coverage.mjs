import fs from 'node:fs';

const SOUTH = -24.5, WEST = -59.5, NORTH = -22.0, EAST = -57.0;
const roads = JSON.parse(fs.readFileSync('app/public/data/roads.geojson', 'utf8'));

let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
const classCounts = {};
const grid = {}; // 0.5 deg cells

for (const feature of roads.features) {
  const highway = feature.properties?.highway || 'unknown';
  classCounts[highway] = (classCounts[highway] || 0) + 1;

  if (feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString') {
    const coords = feature.geometry.type === 'LineString' 
      ? feature.geometry.coordinates 
      : feature.geometry.coordinates.flat();
    
    for (const pt of coords) {
      const [lng, lat] = pt;
      if (lat < minLat) minLat = lat;
      if (lng < minLng) minLng = lng;
      if (lat > maxLat) maxLat = lat;
      if (lng > maxLng) maxLng = lng;

      const glat = Math.floor(lat * 2) / 2;
      const glng = Math.floor(lng * 2) / 2;
      const key = `${glat},${glng}`;
      grid[key] = (grid[key] || 0) + 1;
    }
  }
}

console.log('Dataset Bounds:', { minLat, minLng, maxLat, maxLng });
console.log('Class Counts:', classCounts);
console.log('Grid Counts (approx vertices):');
Object.keys(grid).sort().forEach(k => {
  console.log(`  ${k}: ${grid[k]}`);
});
console.log('Total features:', roads.features.length);
