import { useEffect, useMemo, useState } from 'react'
import {
  Circle,
  CircleMarker,
  GeoJSON,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import { ViewportManager } from './ViewportManager'
import { buildSpatialRoadIndex } from '../lib/spatialRoadIndex'
import { buildRoadNetworkIndex, type RoadNetworkIndex } from '../lib/nearestRoad'
import type { LayerKey } from '../lib/mapLayers'
import type { CandidateRoadSummary } from '../api/simulation'
import type { FeatureCollection } from 'geojson'
import type { Observation, WildlifeTrail } from '../hooks/useWildlifeData'
import type { CandidateRoad, LatLng } from '../lib/geo'
import 'leaflet/dist/leaflet.css'

export interface InterventionOverlay {
  point: LatLng
  radiusM: number
  title: string
  subtitle: string
}

interface WildlifeMapProps {
  center: [number, number]
  zoom: number
  layers: Record<LayerKey, boolean>
  observations: Observation[]
  trails: WildlifeTrail[]
  roadData: FeatureCollection | null
  candidateRoads: CandidateRoad[]
  summaries: Map<number, CandidateRoadSummary>
  selectedRoadId: number | null
  onSelectRoad: (roadId: number) => void
  intervention: InterventionOverlay | null
}

function MapRecenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.setView(center, zoom)
  }, [map, center, zoom])
  return null
}

// Keep the viewport road index in sync with actual map zoom changes.
function MapZoomTracker({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
  })
  return null
}

// --- Full-network click selection -----------------------------------------
// The base road layer (11k+ features) is rendered non-interactive, so clicks
// are matched to the nearest road centreline instead. The tolerance is
// roughly 10 on-screen pixels converted to metres at the current zoom,
// clamped so a click can never reach a distant road.
const CLICK_TOLERANCE_PX = 10
const MIN_CLICK_TOLERANCE_M = 20
const MAX_CLICK_TOLERANCE_M = 500
const METERS_PER_TILE_PIXEL_Z0 = 40075016.686 / 256 // Web-Mercator metres/px at zoom 0

function RoadClickSelector({
  networkIndex,
  onSelectRoad,
}: {
  networkIndex: RoadNetworkIndex
  onSelectRoad: (roadId: number) => void
}) {
  const map = useMap()

  useMapEvents({
    click: (event) => {
      const metersPerPixel =
        (METERS_PER_TILE_PIXEL_Z0 * Math.cos((event.latlng.lat * Math.PI) / 180)) /
        2 ** map.getZoom()
      const toleranceM = Math.min(
        Math.max(metersPerPixel * CLICK_TOLERANCE_PX, MIN_CLICK_TOLERANCE_M),
        MAX_CLICK_TOLERANCE_M,
      )
      // The index returns the positional road id used by the backend, so the
      // selected id can be submitted to /simulate unchanged.
      const roadId = networkIndex.findNearestRoad(
        event.latlng.lat,
        event.latlng.lng,
        toleranceM,
      )