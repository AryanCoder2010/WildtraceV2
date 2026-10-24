import { useEffect, useCallback } from 'react'
import { useMap, useMapEvents } from 'react-leaflet'
import type { SpatialRoadIndex } from '../lib/spatialRoadIndex'

export function ViewportManager({ 
  index, 
  onUpdate 
}: { 
  index: SpatialRoadIndex, 
  zoom: number, 
  onUpdate: (roads: any[]) => void 
}) {
  const map = useMap()
  
  const updateVisible = useCallback(() => {
    const bounds = map.getBounds()
    const currentZoom = map.getZoom()
    const roads = index.findRoadsInBounds({
      minLat: bounds.getSouth(),
      minLng: bounds.getWest(),
      maxLat: bounds.getNorth(),
      maxLng: bounds.getEast()
    })

    const filtered = roads.filter(r => {
      if (currentZoom <= 6) return ["motorway", "trunk", "primary", "secondary"].includes(r.highway)
      if (currentZoom <= 9) return ["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified"].includes(r.highway)
      return true
    })

    onUpdate(filtered)
  }, [map, index, onUpdate])

  useMapEvents({
    moveend: () => updateVisible(),
    zoomend: () => updateVisible()
  })

  useEffect(() => {
    updateVisible()
  }, [updateVisible])

  return null
}
