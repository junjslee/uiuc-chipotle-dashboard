'use client'

import { useState, useEffect } from 'react'
import { Clock, Users, Scale, TrendingUp, CheckCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Report } from '@/lib/supabase'

// ─── Types ─────────────────────────────────────────────────────────────────────

type CrowdStatus = 'walkin' | 'medium' | 'long' | 'outthedoor' | 'unknown'

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

// ─── Bar color helper ───────────────────────────────────────────────────────────

function barColor(pct: number): string {
  if (pct >= 75) return '#ef4444'
  if (pct >= 55) return '#f97316'
  if (pct >= 40) return '#eab308'
  return '#22c55e'
}

// ─── Main Component ─────────────────────────────────────────────────────────────

export default function Home() {
  const [status, setStatus] = useState<CrowdStatus>('unknown')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [selectedDay, setSelectedDay] = useState<string>('')
  const [justReported, setJustReported] = useState<CrowdStatus | null>(null)
  const [, setTick] = useState(0)

  // Apply a report row — shared by initial fetch and realtime updates
  function applyReport(report: Report) {
    const reportedAt = new Date(report.created_at)
    const elapsed = (Date.now() - reportedAt.getTime()) / 60000
    if (elapsed < 30) {
      setStatus(report.status as CrowdStatus)
      setLastUpdated(reportedAt)
    }
  }

  // Init: fetch latest report + subscribe to realtime inserts
  useEffect(() => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    setSelectedDay(dayNames[new Date().getDay()])

    // Initial fetch
    supabase
      .from('reports')
      .select('id, status, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) applyReport(data[0] as Report)
      })

    // Realtime subscription
    const channel = supabase
      .channel('reports-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'reports' },
        (payload) => applyReport(payload.new as Report)
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Every 30s: re-render "X minutes ago" text; expire stale status after 30 min
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1)
      if (lastUpdated) {
        const elapsed = (Date.now() - lastUpdated.getTime()) / 60000
        if (elapsed >= 30) {
          setStatus('unknown')
          setLastUpdated(null)
        }
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [lastUpdated])

  async function handleReport(newStatus: Exclude<CrowdStatus, 'unknown'>) {
    // Optimistic update — UI responds instantly
    setStatus(newStatus)
    setLastUpdated(new Date())
    setJustReported(newStatus)
    setTimeout(() => setJustReported(null), 2000)

    // Persist to DB — Realtime will propagate to all other open sessions
    await supabase.from('reports').insert({ status: newStatus })
  }

  function getLastUpdatedText(): string {
    if (!lastUpdated) return ''
    const minutes = Math.floor((Date.now() - lastUpdated.getTime()) / 60000)
    if (minutes < 1) return 'Just now'
    if (minutes === 1) return '1 minute ago'
    return `${minutes} minutes ago`
  }

  const cfg = STATUS_CONFIG[status]
  const heatValues = HEAT_DATA[selectedDay] ?? HEAT_DATA['Mon']

  return (
    <main
      className="min-h-screen py-6 px-4"
      style={{ backgroundColor: '#0a0a0a' }}
    >
      <div className="max-w-md mx-auto flex flex-col gap-5">

        {/* ── Section 1: Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">
              🌯 Green St. Chipotle
            </h1>
            <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
              Crowdsourced · Live
            </p>
          </div>
          <div
            className="px-3 py-1 rounded-full text-xs font-semibold"
            style={{ backgroundColor: 'rgba(168,22,18,0.2)', color: '#f87171' }}
          >
            LIVE
          </div>
        </div>

        {/* ── Section 2: Live Status Card ───────────────────────────────────── */}
        <div
          className="rounded-2xl p-5 border-2"
          style={{
            backgroundColor: cfg.bgColor,
            borderColor: cfg.borderColor,
          }}
        >
          {/* Pulse dot + label row */}
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

          {/* Wait description */}
          <p
            className="text-base font-semibold mb-4"
            style={{ color: status === 'unknown' ? '#6b7280' : '#e5e7eb' }}
          >
            {status === 'unknown'
              ? 'Unknown — Be the first to update!'
              : cfg.wait}
          </p>

          {/* Last updated */}
          {lastUpdated ? (
            <div
              className="flex items-center gap-1.5 text-xs"
              style={{ color: '#9ca3af' }}
            >
              <Clock size={12} />
              <span>Last Updated: {getLastUpdatedText()}</span>
            </div>
          ) : (
            <div
              className="flex items-center gap-1.5 text-xs"
              style={{ color: '#6b7280' }}
            >
              <Clock size={12} />
              <span>No reports yet today</span>
            </div>
          )}
        </div>

        {/* ── Section 3: Report Live ────────────────────────────────────────── */}
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: '#111111' }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Users size={16} style={{ color: '#FF5F05' }} />
            <h2 className="text-sm font-bold text-white">
              What do you see right now?
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {REPORT_BUTTONS.map((btn) => {
              const isJustReported = justReported === btn.status
              return (
                <button
                  key={btn.status}
                  onClick={() => handleReport(btn.status as Exclude<CrowdStatus, 'unknown'>)}
                  className="relative rounded-xl p-3 flex flex-col items-center justify-center gap-1 min-h-[80px] border-2 transition-all active:scale-95 select-none cursor-pointer"
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

        {/* ── Section 4: Quantity Audit Insight ────────────────────────────── */}
        <div
          className="rounded-2xl p-4 border-l-4"
          style={{
            backgroundColor: '#111111',
            borderLeftColor: '#FF5F05',
          }}
        >
          {/* INSIGHT badge */}
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

        {/* ── Section 5: Heat Map ───────────────────────────────────────────── */}
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

          {/* Day selector */}
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

          {/* Bar chart */}
          <div className="flex gap-1 h-24">
            {heatValues.map((pct, i) => (
              <div
                key={i}
                className="flex-1 flex flex-col justify-end"
              >
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

          {/* X-axis hour labels */}
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

          {/* Legend */}
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

        {/* ── Section 6: Footer ─────────────────────────────────────────────── */}
        <div className="text-center pb-4 space-y-1">
          <p className="text-xs" style={{ color: '#4b5563' }}>
            Data is crowdsourced by UIUC students. Not affiliated with Chipotle
            Mexican Grill.
          </p>
          <p className="text-xs" style={{ color: '#374151' }}>
            Gies College of Business · 2026
          </p>
        </div>

      </div>
    </main>
  )
}
