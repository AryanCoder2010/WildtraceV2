/**
 * nearestRoad.ts — Resolve a map click to a road in the FULL road network.
 * ===========================================================================
 *
 * The simulation backend (``simulation/api.py``) identifies roads by their
 * *positional* index within ``public/data/roads.geojson`` — the feature
 * order produced by ``download_roads.py``. This module builds a lightweight
 * spatial index over that same file so the map can answer "which road was
 * clicked?" using that exact positional id — the id ``POST /simulate``
 * expects. (``lib/demoData.ts`` uses the same convention for demo roads.)
 *
 * Method: road vertices are projected once into a local Cartesian plane with
 * an equirectangular approximation around the network's mean latitude (the
 * same approach as ``roadIntersections.ts``). Each click is then matched to
 * the nearest road centreline segment by an exhaustive O(V) scan over the
 * ~3x10^5 vertices of the bundled network, which runs in a few milliseconds
 * per click. Projection distortion is well under 1% at the scale of the
 * Humid Chaco study area and only affects the click tolerance, never the
 * reported road id.
 */

import type { FeatureCollection, Feature, Geometry } from 'geojson'

const EARTH_RADIUS_M = 6371008.8
const DEG_TO_RAD = Math.PI / 180

interface Pt2 {
  x: number
  y: number
}

/** One road centreline, kept as separate parts (LineString / MultiLineString). */
interface ProjectedRoad {
  roadId: number
  parts: Pt2[][]
}

export interface RoadNetworkIndex {
  /** Number of features in the network; valid positional road ids are 0..roadCount-1. */
  roadCount: number
  /**
   * Positional road id of the road nearest to (lat, lng), or ``null`` when no
   * road centreline is within ``maxDistanceM`` metres of the point.
   */
  findNearestRoad: (lat: number, lng: number, maxDistanceM: number) => number | null
}

/** Extract LineString / MultiLineString rings from an untrusted geometry. */
function collectRings(geometry: Geometry | null): number[][][] | null {
  if (!geometry || typeof geometry !== 'object') return null
  const candidate = geometry as { type?: unknown; coordinates?: unknown }
  if (candidate.type !== 'LineString' && candidate.type !== 'MultiLineString') return null
  if (!Array.isArray(candidate.coordinates)) return null
  if (candidate.type === 'LineString') return [candidate.coordinates as number[][]]
  return candidate.coordinates as number[][][]
}

/**
 * Build a nearest-road index for the given road network. Returns ``null``
 * when the collection is missing or contains no usable road geometry; call
 * handlers must treat that as "map selection unavailable".
 */
export function buildRoadNetworkIndex(
  roads: FeatureCollection | null,
): RoadNetworkIndex | null {
  if (!roads || !Array.isArray(roads.features) || roads.features.length === 0) {
    return null
  }

  // Pass 1: collect raw vertices (keeping the feature index as the road id)
  // and their mean, which becomes the projection origin.
  const rawRoads: { roadId: number; rings: number[][][] }[] = []
  let latSum = 0
  let lngSum = 0
  let vertexCount = 0

  for (const [index, feature] of roads.features.entries()) {
    const rings = collectRings((feature as Feature | null)?.geometry ?? null)
    if (!rings) continue

    const validRings: number[][][] = []
    for (const ring of rings) {
      if (!Array.isArray(ring)) continue
      const validRing: number[][] = []
      for (const position of ring) {
        if (!Array.isArray(position) || position.length < 2) continue
        const lng = Number(position[0])
        const lat = Number(position[1])
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
        validRing.push([lng, lat])
        latSum += lat
        lngSum += lng
        vertexCount += 1
      }
      if (validRing.length >= 2) validRings.push(validRing)
    }
    if (validRings.length > 0) rawRoads.push({ roadId: index, rings: validRings })
  }

  if (vertexCount === 0 || rawRoads.length === 0) return null

  const referenceLatitude = latSum / vertexCount
  const referenceLongitude = lngSum / vertexCount
  const metersPerDegLat = EARTH_RADIUS_M * DEG_TO_RAD
  const metersPerDegLng = metersPerDegLat * Math.cos(referenceLatitude * DEG_TO_RAD)

  // Pass 2: project once; the index is read-only from here on.
  const network: ProjectedRoad[] = rawRoads.map(({ roadId, rings }) => ({
    roadId,
    parts: rings.map((ring) =>
      ring.map(([lng, lat]) => ({
        x: (lng - referenceLongitude) * metersPerDegLng,
        y: (lat - referenceLatitude) * metersPerDegLat,
      })),
    ),
  }))

  const findNearestRoad = (
    lat: number,
    lng: number,
    maxDistanceM: number,
  ): number | null => {
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !Number.isFinite(maxDistanceM) ||
      maxDistanceM <= 0
    ) {
      return null
    }

    const px = (lng - referenceLongitude) * metersPerDegLng
    const py = (lat - referenceLatitude) * metersPerDegLat
    const maxDistanceSq = maxDistanceM * maxDistanceM

    let bestRoadId: number | null = null
    let bestDistanceSq = maxDistanceSq

    for (const road of network) {
      for (const part of road.parts) {
        for (let i = 0; i < part.length - 1; i += 1) {
          const a = part[i]
          const b = part[i + 1]
          const abx = b.x - a.x
          const aby = b.y - a.y
          const apx = px - a.x
          const apy = py - a.y
          const abLenSq = abx * abx + aby * aby

          // Closest point on segment [a, b] to p (clamped parameter).
          let t = abLenSq === 0 ? 0 : (apx * abx + apy * aby) / abLenSq
          if (t < 0) t = 0
          else if (t > 1) t = 1

          const dx = apx - t * abx
          const dy = apy - t * aby
          const distanceSq = dx * dx + dy * dy
          // Strict "<" makes exact ties go to the FIRST (lowest-index) road:
          // some OSM centrelines are duplicated, so a click can be exactly
          // equidistant from two features. Preferring the lower positional id
          // keeps such clicks on the candidate road rather than its duplicate
          // neighbour. Iteration is in feature order, so ids ascend here.
          if (distanceSq < bestDistanceSq) {
            bestDistanceSq = distanceSq
            bestRoadId = road.roadId
          }
        }
      }
    }

    return bestRoadId
  }

  return { roadCount: roads.features.length, findNearestRoad }
}
