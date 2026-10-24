import RBush from 'rbush';
import type { FeatureCollection } from 'geojson';

export interface SpatialRoadIndex {
  bush: RBush<any>;
  findRoadsInBounds: (bounds: { minLat: number, minLng: number, maxLat: number, maxLng: number }) => any[];
}

export function buildSpatialRoadIndex(roads: FeatureCollection | null): SpatialRoadIndex | null {
  if (!roads || !Array.isArray(roads.features)) return null;

  const bush = new RBush();
  const items: any[] = [];

  for (const [index, feature] of roads.features.entries()) {
    if (feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString') {
      const coords = feature.geometry.type === 'LineString' 
        ? feature.geometry.coordinates 
        : feature.geometry.coordinates.flat();
      
      let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
      for (const pt of coords as number[][]) {
        if (pt[1] < minLat) minLat = pt[1];
        if (pt[0] < minLng) minLng = pt[0];
        if (pt[1] > maxLat) maxLat = pt[1];
        if (pt[0] > maxLng) maxLng = pt[0];
      }

      items.push({
        minX: minLng, minY: minLat, maxX: maxLng, maxY: maxLat,
        roadId: index,
        highway: feature.properties?.highway || 'unclassified'
      });
    }
  }

  bush.load(items);

  return {
    bush,
    findRoadsInBounds: (b) => bush.search({ minX: b.minLng, minY: b.minLat, maxX: b.maxLng, maxY: b.maxLat })
  };
}
