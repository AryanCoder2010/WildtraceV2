import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  INTERVENTION_LABELS,
  isSupportedIntervention,
  type CandidateRoadSummary,
  type InterventionType,
} from '../api/simulation'
import { Icon } from './Icon'
import { InterventionParameters } from './InterventionParameters'
import { ScenarioStatus } from './ScenarioStatus'
import type { SimulationStatus } from '../hooks/useSimulation'

const ALL_INTERVENTIONS: InterventionType[] = [
  'overpass',
  'underpass',
  'road_reroute',
  'green_corridor',
  'signage',
  'night_lighting',
]

export interface InterventionPlannerProps {
  intervention: InterventionType
  onInterventionChange: (value: InterventionType) => void
  candidates: CandidateRoadSummary[]
  /** Total features in the full road network (valid road ids are 0..roadCount-1). */
  roadCount: number | null
  selectedRoadId: number | null
  onSelectRoad: (roadId: number) => void
  selectedSummary: CandidateRoadSummary | null
  radiusM: number
  onRadiusChange: (value: number) => void
  radiusError: string | null
  issues: string[]
  canRun: boolean
  status: SimulationStatus
  isDemo: boolean
  demoReason: string | null
  error: string | null
  onRun: () => void
  onReset: () => void
}

export function InterventionPlanner({
  intervention,
  onInterventionChange,
  candidates,
  roadCount,
  selectedRoadId,
  onSelectRoad,
  selectedSummary,
  radiusM,
  onRadiusChange,
  radiusError,
  issues,
  canRun,
  status,
  isDemo,
  demoReason,
  error,
  onRun,
  onReset,
}: InterventionPlannerProps) {
  const sortedCandidates = useMemo(
    () => [...candidates].sort((a, b) => b.movement_segments - a.movement_segments),
    [candidates],
  )

  const [roadIdDraft, setRoadIdDraft] = useState('')
  const [roadIdError, setRoadIdError] = useState<string | null>(null)

  const handleRoadIdSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = roadIdDraft.trim()
    if (!/^\d+$/.test(trimmed)) {
      setRoadIdError('Enter a whole road ID (digits only).')
      return
    }
    const value = Number(trimmed)
    if (roadCount !== null && value >= roadCount) {
      setRoadIdError(`Road ID must be between 0 and ${roadCount - 1}.`)
      return
    }
    setRoadIdError(null)
    onSelectRoad(value)
  }

  const selectedIsCandidate =
    selectedRoadId !== null && candidates.some((c) => c.road_id === selectedRoadId)

  const supported = isSupportedIntervention(intervention)
  const running = status === 'loading'

  return (
    <div className="flex flex-col gap-5">
      <section>
        <FieldLabel htmlFor="intervention">Intervention type</FieldLabel>
        <select
          id="intervention"
          value={intervention}
          onChange={(event) => onInterventionChange(event.target.value as InterventionType)}
          className="w-full rounded-lg border border-[#24362c] bg-[#0a120e] px-3 py-2 text-[13px] text-slate-200 focus:border-emerald-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
        >
          {ALL_INTERVENTIONS.map((value) => (
            <option key={value} value={value}>
              {INTERVENTION_LABELS[value]}
              {isSupportedIntervention(value) ? '' : ' (not modelled)'}
            </option>
          ))}
        </select>
        {!supported && (
          <p className="mt-1.5 text-[11px] text-amber-400">
            This intervention is listed but not simulated by the engine.
          </p>
        )}
      </section>

      <section>
        <FieldLabel htmlFor="candidate-road">Road</FieldLabel>
        <select
          id="candidate-road"
          value={selectedRoadId ?? ''}
          onChange={(event) => {
            const value = event.target.value
            if (value !== '') onSelectRoad(Number(value))
          }}
          className="w-full rounded-lg border border-[#24362c] bg-[#0a120e] px-3 py-2 text-[13px] text-slate-200 focus:border-emerald-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
        >
          <option value="">Select a candidate road…</option>
          {sortedCandidates.map((candidate) => (
            <option key={candidate.road_id} value={candidate.road_id}>
              #{candidate.road_id} · {candidate.highway} · {candidate.movement_segments} crossings
            </option>
          ))}
          {selectedRoadId !== null && !selectedIsCandidate && (
            <option value={selectedRoadId}>
              #{selectedRoadId} · full-network road (not a candidate)
            </option>
          )}
        </select>
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
          <Icon name="crosshair" size={12} />
          Or click any road on the map — candidate conflict roads are highlighted in orange.
        </p>

        {selectedSummary ? (
          <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-[#24362c] bg-[#0a120e] p-3 text-[11px]">
            <MetaItem label="Road ID" value={`#${selectedSummary.road_id}`} />
            <MetaItem label="Class" value={selectedSummary.highway} />
            <MetaItem
              label="Movement segments"
              value={String(selectedSummary.movement_segments)}
            />
            <MetaItem label="Source" value="Observed GPS geometry" />
          </dl>
        ) : selectedRoadId !== null ? (
          <div className="mt-2.5 rounded-lg border border-[#24362c] bg-[#0a120e] p-3 text-[11px]">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              <MetaItem label="Road ID" value={`#${selectedRoadId}`} />
              <MetaItem label="Crossing summary" value="Not available" />
            </dl>
            <p className="mt-2 leading-relaxed text-slate-500">
              This road belongs to the full network but is not one of the candidate
              conflict roads, so no observed crossing summary exists for it. A
              simulation can still be run: baseline metrics are computed by the
              engine from the GPS observations within the chosen radius of this
              road.
            </p>
          </div>
        ) : (
          <p className="mt-2.5 rounded-lg border border-dashed border-[#24362c] px-3 py-2 text-[11px] text-slate-500">
            No road selected. Choose one from the list or the map.
          </p>
        )}

        <form
          className="mt-2.5 flex items-center gap-2"
          onSubmit={handleRoadIdSubmit}
        >
          <input
            id="road-id-input"
            type="text"
            inputMode="numeric"
            value={roadIdDraft}
            onChange={(event) => setRoadIdDraft(event.target.value)}
            placeholder={
              roadCount !== null ? `Road ID (0–${roadCount - 1})` : 'Road ID'
            }
            aria-label="Road ID from the full road network"
            className="w-full rounded-lg border border-[#24362c] bg-[#0a120e] px-3 py-2 text-[13px] text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg border border-[#24362c] bg-[#0a120e] px-3.5 py-2 text-[13px] font-medium text-slate-300 transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
          >
            Use ID
          </button>
        </form>
        {roadIdError && (
          <p className="mt-1.5 text-[11px] text-amber-400">{roadIdError}</p>
        )}
      </section>

      <section>
        <FieldLabel>Intervention parameters</FieldLabel>
        <InterventionParameters
          intervention={intervention}
          radiusM={radiusM}
          onRadiusChange={onRadiusChange}
          radiusError={radiusError}
          selectedRoadLabel={selectedRoadId !== null ? `#${selectedRoadId}` : null}
        />
      </section>

      {issues.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-amber-500/25 bg-amber-500/10 p-2.5 text-[11px] text-amber-300">
          {issues.map((issue) => (
            <li key={issue} className="flex items-start gap-1.5">
              <Icon name="alert" size={12} />
              <span>{issue}</span>
            </li>
          ))}
        </ul>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRun}
            disabled={!canRun || running}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-[13px] font-semibold text-emerald-950 transition-colors hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:bg-[#1d2f26] disabled:text-slate-500"
          >
            <Icon name="play" size={15} />
            {running ? 'Running…' : 'Run Simulation'}
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={running}
            className="flex items-center justify-center gap-2 rounded-lg border border-[#24362c] bg-[#0a120e] px-3.5 py-2.5 text-[13px] font-medium text-slate-300 transition-colors hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-50"
          >
            <Icon name="reset" size={15} />
            Reset
          </button>
        </div>
        <ScenarioStatus
          status={status}
          isDemo={isDemo}
          demoReason={demoReason}
          modelStatus={undefined}
          error={error}
        />
      </section>
    </div>
  )
}

function FieldLabel({
  children,
  htmlFor,
}: {
  children: ReactNode
  htmlFor?: string
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500"
    >
      {children}
    </label>
  )
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-200">{value}</dd>
    </div>
  )
}
