'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Clock, Users, Scale, TrendingUp, CheckCircle, MapPin, Share2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Report } from '@/lib/supabase'

// ─── Types ─────────────────────────────────────────────────────────────────────

type CrowdStatus = 'walkin' | 'medium' | 'long' | 'outthedoor' | 'unknown'

// ─── Constants ──────────────────────────────────────────────────────────────────

const CHIPOTLE_LAT = 40.10968
const CHIPOTLE_LNG = -88.22714
const PROXIMITY_METERS = 300
const STATUS_WINDOW_MS = 30 * 60 * 1000   // 30-min window for majority vote
const COOLDOWN_MS = 10 * 60 * 1000        // 10 min between reports per device
const COOLDOWN_KEY = 'chipotle_last_report'

// ─── Status Config ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  CrowdStatus,
  {
    label: string
    wait: string
    color: string
    bgColor: string
    borderColor: string
    dotColor: string
    textColor: string
    emoji: string
  }
> = {
  walkin: {
    label: 'WALK-IN',
    wait: '0–5 min wait',
    color: '#22c55e',
    bgColor: 'rgba(34,197,94,0.10)',
    borderColor: '#22c55e',
    dotColor: '#22c55e',
    textColor: '#4ade80',
    emoji: '🟢',
  },
  medium: {
    label: 'MEDIUM',
    wait: '10–15 min wait',
    color: '#eab308',
    bgColor: 'rgba(234,179,8,0.10)',
    borderColor: '#eab308',
    dotColor: '#eab308',
    textColor: '#facc15',
    emoji: '🟡',
  },
  long: {
    label: 'LONG',
    wait: '20+ min wait',
    color: '#f97316',
    bgColor: 'rgba(249,115,22,0.10)',
    borderColor: '#f97316',
    dotColor: '#f97316',
    textColor: '#fb923c',
    emoji: '🟠',
  },
  outthedoor: {
    label: 'OUT THE DOOR',
    wait: 'Line past the entrance',
    color: '#A81612',
    bgColor: 'rgba(168,22,18,0.15)',
    borderColor: '#A81612',
    dotColor: '#ef4444',
    textColor: '#f87171',
    emoji: '🔴',
  },
  unknown: {
    label: 'UNKNOWN',
    wait: 'Be the first to update!',
    color: '#6b7280',
    bgColor: 'rgba(107,114,128,0.10)',
    borderColor: '#4b5563',
    dotColor: '#6b7280',
    textColor: '#9ca3af',
    emoji: '❓',
  },
}

// ─── Heat Map Data ──────────────────────────────────────────────────────────────

const HOURS = [
  '10am','11am','12pm','1pm','2pm','3pm','4pm','5pm','6pm','7pm','8pm','9pm',
]
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

const HEAT_DATA: Record<string, number[]> = {
  Mon: [20, 45, 85, 90, 60, 35, 30, 55, 70, 65, 50, 25],
  Tue: [20, 45, 90, 95, 65, 35, 30, 55, 70, 65, 45, 20],
  Wed: [20, 50, 85, 90, 60, 35, 35, 60, 75, 70, 50, 25],
  Thu: [25, 50, 90, 95, 65, 40, 35, 60, 75, 70, 55, 30],
  Fri: [25, 55, 95, 100, 75, 50, 45, 70, 85, 80, 65, 40],
  Sat: [30, 40, 70, 85, 90, 80, 65, 75, 85, 80, 65, 40],
  Sun: [20, 35, 60, 80, 85, 75, 60, 65, 75, 70, 55, 30],
}

// ─── Report Buttons Config ──────────────────────────────────────────────────────

type ReportButton = {
  status: Exclude<CrowdStatus, 'unknown'>
  emoji: string
  label: string
  sub: string
  accentColor: string
  borderColor: string
  bgHover: string
}

const REPORT_BUTTONS: ReportButton[] = [
  {
    status: 'walkin',
    emoji: '🚶',
    label: 'Walk-In',
    sub: '0–5 min',
    accentColor: '#22c55e',
    borderColor: 'rgba(34,197,94,0.4)',
    bgHover: 'rgba(34,197,94,0.08)',
  },
  {
    status: 'medium',
    emoji: '⏳',
    label: 'Medium',
    sub: '10–15 min',
    accentColor: '#eab308',
    borderColor: 'rgba(234,179,8,0.4)',
    bgHover: 'rgba(234,179,8,0.08)',
  },
  {
    status: 'long',
    emoji: '😬',
    label: 'Long',
    sub: '20+ min',
    accentColor: '#f97316',
    borderColor: 'rgba(249,115,22,0.4)',
    bgHover: 'rgba(249,115,22,0.08)',
  },
  {
    status: 'outthedoor',
    emoji: '🚨',
    label: 'Out the Door',
    sub: 'Past entrance',
    accentColor: '#A81612',
    borderColor: 'rgba(168,22,18,0.5)',
    bgHover: 'rgba(168,22,18,0.12)',
  },
]

// ─── Helpers ────────────────────────────────────────────────────────────────────

function barColor(pct: number): string {
  if (pct >= 75) return '#ef4444'
  if (pct >= 55) return '#f97316'
  if (pct >= 40) return '#eab308'
  return '#22c55e'
}

/** Haversine distance in meters */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Majority vote over reports within the time window */
function majorityStatus(reports: Report[]): {
  status: CrowdStatus
  count: number
  newestAt: Date | null
} {
  const now = Date.now()
  const recent = reports.filter(
    (r) => now - new Date(r.created_at).getTime() < STATUS_WINDOW_MS
  )
  if (recent.length === 0) return { status: 'unknown', count: 0, newestAt: null }

  const tally: Record<string, number> = {}
  for (const r of recent) tally[r.status] = (tally[r.status] ?? 0) + 1
  const winner = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0]

  const newestAt = new Date(
    Math.max(...recent.map((r) => new Date(r.created_at).getTime()))
  )
  return { status: winner as CrowdStatus, count: recent.length, newestAt }
}

/** Remaining cooldown in seconds, 0 if ready */
function cooldownSecondsRemaining(): number {
  if (typeof window === 'undefined') return 0
  const raw = localStorage.getItem(COOLDOWN_KEY)
  if (!raw) return 0
  const elapsed = Date.now() - Number(raw)
  return elapsed >= COOLDOWN_MS ? 0 : Math.ceil((COOLDOWN_MS - elapsed) / 1000)
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function Home() {
  const [status, setStatus] = useState<CrowdStatus>('unknown')
  const [reportCount, setReportCount] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [selectedDay, setSelectedDay] = useState<string>('')
  const [justReported, setJustReported] = useState<CrowdStatus | null>(null)
  const [, setTick] = useState(0)
  const [isNearChipotle, setIsNearChipotle] = useState(false)
  const [proximityDismissed, setProximityDismissed] = useState(false)
  const [cooldownSecs, setCooldownSecs] = useState(0)
  const [copied, setCopied] = useState(false)

  const reportsRef = useRef<Report[]>([])

  const recompute = useCallback(() => {
    const { status: s, count, newestAt } = majorityStatus(reportsRef.current)
    // Prune stale entries
    const now = Date.now()
    reportsRef.current = reportsRef.current.filter(
      (r) => now - new Date(r.created_at).getTime() < STATUS_WINDOW_MS
    )
    setStatus(s)
    setReportCount(count)
    setLastUpdated(newestAt)
  }, [])

  // Init: fetch all reports in the last 30 min + realtime subscription
  useEffect(() => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    setSelectedDay(dayNames[new Date().getDay()])

    supabase
      .from('reports')
      .select('id, status, created_at')
      .gte('created_at', new Date(Date.now() - STATUS_WINDOW_MS).toISOString())
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) {
          reportsRef.current = data as Report[]
          recompute()
        }
      })

    const channel = supabase
      .channel('reports-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reports' },
        (payload) => {
          reportsRef.current = [...reportsRef.current, payload.new as Report]
          recompute()
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [recompute])

  // Tick every 30s: prune expired reports and recompute
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1)
      recompute()
    }, 30000)
    return () => clearInterval(interval)
  }, [recompute])

  // Geolocation: one-time proximity check on mount
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const dist = haversineMeters(
          pos.coords.latitude,
          pos.coords.longitude,
          CHIPOTLE_LAT,
          CHIPOTLE_LNG
        )
        if (dist <= PROXIMITY_METERS) setIsNearChipotle(true)
      },
      () => { /* permission denied — silent */ }
    )
  }, [])

  // Cooldown: tick every second while active
  useEffect(() => {
    setCooldownSecs(cooldownSecondsRemaining())
    const interval = setInterval(() => {
      setCooldownSecs(cooldownSecondsRemaining())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  async function handleReport(newStatus: Exclude<CrowdStatus, 'unknown'>) {
    if (cooldownSecs > 0) return

    // Optimistic UI — update state directly so the card responds instantly.
    // We do NOT touch reportsRef here; the realtime INSERT event will add the
    // real row and recompute the majority vote, avoiding a duplicate count.
    setStatus(newStatus)
    setLastUpdated(new Date())
    setJustReported(newStatus)
    setTimeout(() => setJustReported(null), 2000)

    // Set cooldown
    localStorage.setItem(COOLDOWN_KEY, String(Date.now()))
    setCooldownSecs(COOLDOWN_MS / 1000)

    await supabase.from('reports').insert({ status: newStatus })
  }

  function getLastUpdatedText(): string {
    if (!lastUpdated) return ''
    const minutes = Math.floor((Date.now() - lastUpdated.getTime()) / 60000)
    if (minutes < 1) return 'Just now'
    if (minutes === 1) return '1 minute ago'
    return `${minutes} minutes ago`
  }

  async function handleShare() {
    const url = window.location.href
    if (navigator.share) {
      await navigator.share({ title: 'Green St. Chipotle — Live Line Tracker', url })
    } else {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  function formatCooldown(secs: number): string {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return m > 0 ? `${m}m ${s}s` : `${s}s`
  }

  const cfg = STATUS_CONFIG[status]
  const heatValues = HEAT_DATA[selectedDay] ?? HEAT_DATA['Mon']
  const showProximityBanner = isNearChipotle && !proximityDismissed && justReported === null

  return (
    <main
      className="min-h-screen py-6 px-4"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      <div className="max-w-md mx-auto flex flex-col gap-5">

        {/* ── Proximity Banner ──────────────────────────────────────────────── */}
        {showProximityBanner && (
          <div
            className="rounded-2xl p-4 flex items-start gap-3 border"
            style={{
              backgroundColor: 'rgba(255,95,5,0.08)',
              borderColor: 'rgba(255,95,5,0.35)',
            }}
          >
            <MapPin size={18} className="shrink-0 mt-0.5" style={{ color: '#FF5F05' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white leading-tight">
                You&apos;re near Chipotle!
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#d1d5db' }}>
                Help other students — how&apos;s the line right now?
              </p>
            </div>
            <button
              onClick={() => setProximityDismissed(true)}
              className="shrink-0 text-lg leading-none cursor-pointer"
              style={{ color: '#6b7280' }}
            >
              ×
            </button>
          </div>
        )}

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">
              🌯 Green St. Chipotle
            </h1>
            <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
              Crowdsourced · Live
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors"
              style={{
                backgroundColor: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                color: copied ? '#4ade80' : '#9ca3af',
              }}
            >
              <Share2 size={11} />
              {copied ? 'Copied!' : 'Share'}
            </button>
            <div
              className="px-3 py-1 rounded-full text-xs font-semibold"
              style={{ backgroundColor: 'rgba(168,22,18,0.2)', color: '#f87171' }}
            >
              LIVE
            </div>
          </div>
        </div>

        {/* ── Live Status Card ──────────────────────────────────────────────── */}
        <div
          className="rounded-2xl p-5 border-2"
          style={{
            backgroundColor: cfg.bgColor,
            borderColor: cfg.borderColor,
          }}
        >
          <div className="flex items-center gap-3 mb-2">
            {status !== 'unknown' && (
              <span
                className="w-3 h-3 rounded-full animate-pulse shrink-0"
                style={{ backgroundColor: cfg.dotColor }}
              />
            )}
            <span
              className="text-5xl font-black tracking-tight leading-none"
              style={{ color: cfg.textColor }}
            >
              {cfg.label}
            </span>
          </div>

          <p
            className="text-base font-semibold mb-4"
            style={{ color: status === 'unknown' ? '#6b7280' : '#e5e7eb' }}
          >
            {status === 'unknown'
              ? 'Unknown — Be the first to update!'
              : cfg.wait}
          </p>

          <div className="flex items-center justify-between">
            {lastUpdated ? (
              <div
                className="flex items-center gap-1.5 text-xs"
                style={{ color: '#9ca3af' }}
              >
                <Clock size={12} />
                <span>Updated {getLastUpdatedText()}</span>
              </div>
            ) : (
              <div
                className="flex items-center gap-1.5 text-xs"
                style={{ color: '#6b7280' }}
              >
                <Clock size={12} />
                <span>No reports yet</span>
              </div>
            )}

            {reportCount > 0 && (
              <div
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  color: '#9ca3af',
                }}
              >
                <Users size={10} />
                <span>{reportCount} {reportCount === 1 ? 'report' : 'reports'}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Report Live ───────────────────────────────────────────────────── */}
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: '#111111' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users size={16} style={{ color: '#FF5F05' }} />
              <h2 className="text-sm font-bold text-white">
                What do you see right now?
              </h2>
            </div>
            {cooldownSecs > 0 && (
              <span className="text-xs" style={{ color: '#6b7280' }}>
                Next in {formatCooldown(cooldownSecs)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {REPORT_BUTTONS.map((btn) => {
              const isJustReported = justReported === btn.status
              const disabled = cooldownSecs > 0
              return (
                <button
                  key={btn.status}
                  onClick={() => handleReport(btn.status as Exclude<CrowdStatus, 'unknown'>)}
                  disabled={disabled}
                  className="relative rounded-xl p-3 flex flex-col items-center justify-center gap-1 min-h-[80px] border-2 transition-all active:scale-95 select-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                  style={{
                    backgroundColor: isJustReported
                      ? btn.bgHover
                      : 'rgba(255,255,255,0.03)',
                    borderColor: isJustReported
                      ? btn.accentColor
                      : btn.borderColor,
                  }}
                >
                  {isJustReported && (
                    <div className="absolute top-2 right-2">
                      <CheckCircle size={14} style={{ color: btn.accentColor }} />
                    </div>
                  )}
                  <span className="text-2xl">{btn.emoji}</span>
                  <span className="text-sm font-bold leading-tight text-white">
                    {btn.label}
                  </span>
                  <span
                    className="text-xs font-medium"
                    style={{ color: btn.accentColor }}
                  >
                    {btn.sub}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Quantity Audit Insight ────────────────────────────────────────── */}
        <div
          className="rounded-2xl p-4 border-l-4"
          style={{
            backgroundColor: '#111111',
            borderLeftColor: '#FF5F05',
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: 'rgba(255,95,5,0.15)',
                color: '#FF5F05',
              }}
            >
              INSIGHT
            </span>
          </div>

          <div className="flex items-start gap-2 mb-2">
            <Scale size={16} className="shrink-0 mt-0.5" style={{ color: '#FF5F05' }} />
            <h3 className="text-sm font-bold text-white">
              In-Person = More Food
            </h3>
          </div>

          <p className="text-sm leading-relaxed mb-3" style={{ color: '#d1d5db' }}>
            Research shows in-person orders at this location are approximately{' '}
            <span className="font-bold text-white">20% larger by weight</span>{' '}
            than mobile app orders.
          </p>

          <ul className="mb-3 space-y-1">
            <li
              className="text-xs flex items-start gap-1.5"
              style={{ color: '#9ca3af' }}
            >
              <span style={{ color: '#FF5F05' }}>•</span>
              Students who order in-person receive measurably more food for the
              same price.
            </li>
          </ul>

          <p className="text-xs font-semibold" style={{ color: '#FF5F05' }}>
            Worth the wait? Check the line status above.
          </p>
        </div>

        {/* ── Heat Map ──────────────────────────────────────────────────────── */}
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: '#111111' }}
        >
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={16} style={{ color: '#FF5F05' }} />
            <h2 className="text-sm font-bold text-white">Typical Busy Times</h2>
          </div>
          <p className="text-xs mb-4" style={{ color: '#6b7280' }}>
            Based on historical data — not live
          </p>

          <div className="flex gap-1 mb-5 overflow-x-auto pb-1">
            {DAYS.map((day) => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                style={
                  selectedDay === day
                    ? { backgroundColor: '#A81612', color: '#ffffff' }
                    : { backgroundColor: 'rgba(255,255,255,0.06)', color: '#9ca3af' }
                }
              >
                {day}
              </button>
            ))}
          </div>

          <div className="flex gap-1 h-24">
            {heatValues.map((pct, i) => (
              <div key={i} className="flex-1 flex flex-col justify-end">
                <div
                  className="w-full rounded-t-sm transition-all duration-300"
                  style={{
                    height: `${pct}%`,
                    backgroundColor: barColor(pct),
                    opacity: 0.85,
                  }}
                />
              </div>
            ))}
          </div>

          <div className="flex gap-1 mt-1">
            {HOURS.map((hr, i) => (
              <div
                key={i}
                className="flex-1 text-center"
                style={{ fontSize: '9px', color: '#6b7280' }}
              >
                {hr}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {[
              { color: '#22c55e', label: 'Quiet' },
              { color: '#eab308', label: 'Moderate' },
              { color: '#f97316', label: 'Busy' },
              { color: '#ef4444', label: 'Packed' },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-1">
                <div
                  className="w-2 h-2 rounded-sm"
                  style={{ backgroundColor: l.color }}
                />
                <span style={{ fontSize: '10px', color: '#6b7280' }}>
                  {l.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div className="text-center pb-4 space-y-1">
          <p className="text-xs" style={{ color: '#4b5563' }}>
            Data is crowdsourced by UIUC students. Not affiliated with Chipotle
            Mexican Grill.
          </p>
          <p className="text-xs" style={{ color: '#374151' }}>
            Since 2026
          </p>
        </div>

      </div>
    </main>
  )
}
