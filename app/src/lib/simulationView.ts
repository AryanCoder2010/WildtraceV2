import type { SimulationResponse } from '../api/simulation'
import { INTERVENTION_LABELS } from '../api/simulation'
import { structurePointToLatLng, type LatLng } from './geo'
import type { InterventionOverlay } from '../components/WildlifeMap'

export interface Metric {
  label: string
  baseline: number | null
  intervention: number | null
  unit?: string
  /** Whether an increase is ecologically desirable. */
  higherIsBetter: boolean
  baselineKind: 'observed' | 'estimate'
  interventionKind: 'observed' | 'estimate'
  description?: string
  /** Render as a percentage (values given as fractions, e.g. 0.68). */
  isShare?: boolean
  /** Baseline-only context metric (no intervention counterpart). */
  contextOnly?: boolean
}

/**
 * Translate the backend response into the metric rows the UI compares. Only
 * numbers actually returned by the engine are used; nothing is inferred.
 */
export function buildMetrics(result: SimulationResponse): Metric[] {
  const { baseline, scenario, intervention } = result
  const metrics: Metric[] = []

  const exposure =
    scenario.hypothetical_exposure_index ?? scenario.residual_crossing_segments ?? null

  metrics.push({
    label: 'Movement segments intersecting road',
    baseline: baseline.crossing_segments,
    intervention: exposure,
    higherIsBetter: false,
    baselineKind: 'observed',
    interventionKind: 'estimate',
    description:
      'Modelled segments intersecting the road. Baseline reflects GPS-derived movement segments; the intervention value is the modelled residual intersection count.',
  })

  if (typeof scenario.served_crossing_share === 'number') {
    metrics.push({
      label: 'Crossings served by structure',
      baseline: 0,
      intervention: scenario.served_crossing_share,
      higherIsBetter: true,
      baselineKind: 'observed',
      interventionKind: 'estimate',
      isShare: true,
      description:
        'The modelled share of movement segments within the structure radius. Displayed as an estimate.',
    })
  }

  // Add the contextual metrics, making sure not to show fake intervention bars
  metrics.push({
    label: 'Wildlife–road encounters (observed)',
    baseline: baseline.crossing_events,
    intervention: null,
    higherIsBetter: false,
    baselineKind: 'observed',
    interventionKind: 'estimate',
    contextOnly: true,
    description:
      'Count of observed movement segments crossing the road. The engine reports this baseline only.',
  })

  metrics.push({
    label: 'Observations within radius (observed)',
    baseline: baseline.observations_near_road,
    intervention: null,
    higherIsBetter: false,
    baselineKind: 'observed',
    interventionKind: 'estimate',
    contextOnly: true,
    description: 'GPS fixes within the simulation radius of the selected road.',
  })

  return metrics
}

/** Extract a plottable intervention location from the response, if any. */
export function extractInterventionOverlay(
  result: SimulationResponse,
): InterventionOverlay | null {
  const point = result.scenario.structure_point
  if (!point) return null
  const latLng: LatLng | null = structurePointToLatLng(point)
  if (!latLng) return null

  return {
    point: latLng,
    radiusM: result.radius_m,
    title: `${INTERVENTION_LABELS[result.intervention]} · Road #${result.road_id}`,
    subtitle:
      result.scenario.method ??
      result.scenario.reason ??
      'Proposed intervention location (model).',
  }
}
