# PRD: Green St. Chipotle Efficiency Dashboard

**Version**: 1.0  
**Date**: 2026-04-02  
**Status**: Draft — Awaiting Approval

---

## 1. Executive Summary

UIUC students on Green St. face a daily tradeoff: wait 20+ minutes in line at Chipotle for a full-portion bowl, or order online in 2 minutes for a measurably smaller one. This app — a crowdsourced, one-tap live status tracker — gives students the real-time intel they need to make a smarter call before they leave their dorm.

Inspired by iCover (UIUC bar cover tracker), the app is frictionless by design: no login, no account, just tap what you see and go.

---

## 2. Problem Statement

| Pain Point | Description |
|---|---|
| Information vacuum | Students cannot know the line length until they are already there |
| Portion asymmetry | Online orders are ~20% smaller by weight than in-person orders (crowdsourced + anecdotal research) |
| Wasted trips | Students walk to Chipotle, see the line, and leave — time and opportunity cost |
| No camera access | Chipotle management denied camera/sensor access, ruling out automated solutions |

The only data source available is the students themselves.

---

## 3. Goals & Success Metrics

### P0 — Must Have (Launch Blockers)
| Goal | Metric |
|---|---|
| Students can report line status | Report button tap registers and updates global status in < 2 seconds |
| Status is visible at a glance | Crowd level is readable without scrolling on a 390px-wide screen |
| Stale data is handled gracefully | Status auto-resets to "Unknown" if last report is > 30 minutes old |

### P1 — Should Have (v1 Quality Bar)
| Goal | Metric |
|---|---|
| Students return to the app | App is bookmarked / added to home screen by repeat users |
| Quantity Audit insight is seen | Info card is visible above the fold on mobile |
| Typical busy times are surfaced | Heat map renders on first load without a network call |

### P2 — Nice to Have (Post-Launch)
| Goal | Metric |
|---|---|
| Report history / trends | Basic analytics on submission timestamps |
| PWA install prompt | Users can add to home screen on iOS/Android |

### Success Definition
The app is succeeding if students are actively submitting reports. A dead feed means the app failed to achieve adoption. A live feed (multiple reports per lunch hour) means it works.

---

## 4. Non-Goals

- No user accounts or authentication
- No admin moderation dashboard (v1)
- No native iOS/Android app (web-only, optimized for mobile browsers)
- No integration with Chipotle's internal systems
- No automated line detection (camera access was denied)
- No gamification or points system (v1)

---

## 5. User Personas

### Persona A — "The Planner" (primary)
> Maya, sophomore, CS major. Eats at Chipotle 3x/week between classes. Checks her phone before deciding where to eat. She wants one number: is it worth going in person right now?

**Behavior**: Opens app, glances at status, makes decision, potentially submits a report after visiting.

### Persona B — "The Reporter" (enabler)
> Jake, junior, already in line at Chipotle. Opens app, taps the line status he sees, submits in 5 seconds. He's doing this for the next person, not himself.

**Behavior**: Quick one-tap report. No friction tolerated. Will not fill out a form.

### Persona C — "The Optimizer" (power user)
> Priya, senior, knows Chipotle gets slammed at noon. She checks the heat map to decide whether to go at 11:30 or wait until 1pm.

**Behavior**: Scrolls to the heat map section. Uses historical pattern data to plan ahead.

---

## 6. Functional Requirements

### FR-001: Live Status Display
- Display current crowd level as one of: `Walk-in` | `Medium` | `Long` | `Out the Door` | `Unknown`
- Display "Last updated: X minutes ago" beneath the status
- If last report is older than 30 minutes OR no reports exist, display: **"Unknown — Be the first to update!"**
- Status indicator must use high-contrast color coding:
  - Walk-in → Green
  - Medium → Yellow
  - Long → Orange
  - Out the Door → Red
  - Unknown → Gray

### FR-002: One-Tap Reporting
- Four report buttons, always visible without scrolling on mobile:
  - **Walk-in** — "0–5 min wait"
  - **Medium** — "10–15 min wait"
  - **Long** — "20+ min wait"
  - **Out the Door** — "Line past the entrance"
- Tapping a button immediately updates the global status for all users
- No confirmation screen, no login, no CAPTCHA (v1)
- Show brief visual feedback on tap (button flash/pulse)

### FR-003: Quantity Audit Info Card
- Static card displaying the portion asymmetry insight
- Copy: *"Research shows in-person orders are ~20% larger by weight than mobile orders at this location."*
- Subtext: *"In-person is worth the wait — if you have the time."*
- Card is informational only; no interaction required

### FR-004: Predictive Heat Map
- Static chart (no live data) showing typical busy periods by hour and day
- Based on historical Google Popular Times data for this Chipotle location
- Days: Monday–Sunday on X-axis (or hour breakdown within a selected day)
- Renders on page load with no network call (hardcoded data)
- Label: *"Typical Busy Times (historical)"* to clearly distinguish from live data

### FR-005: Real-Time Sync
- When any user submits a report, all open sessions update their status display within 2 seconds
- Powered by Supabase Realtime (Postgres changes → broadcast)
- Timestamp of last report stored and displayed

---

## 7. UI/UX Requirements

| Requirement | Spec |
|---|---|
| Theme | Dark mode only |
| Accent colors | Chipotle Red (`#A81612`) primary, UIUC Orange (`#FF5F05`) secondary, UIUC Blue (`#13294B`) tertiary |
| Typography | Large, bold status text (min 32px for crowd level label) |
| Mobile-first | Designed for 390px width (iPhone 14 viewport), no horizontal scroll |
| Touch targets | All buttons min 48×48px per WCAG 2.1 |
| No login | Zero auth friction; anonymous submissions only |
| Load speed | Fully interactive in < 1.5 seconds on mobile 4G |
| Feedback | Tap → immediate visual response before server confirms |

---

## 8. Technical Implementation Plan

### Stack
| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Database | Supabase (Postgres + Realtime) |
| Hosting | Vercel (free tier) |
| Charts | Recharts or Chart.js (static data) |

### Data Model (Supabase)

**Table: `reports`**
```
id          uuid, primary key
status      text  -- 'walkin' | 'medium' | 'long' | 'outthedoor'
created_at  timestamptz, default now()
```

Only the most recent row is used for current status. No user ID stored.

### State Logic
```
currentStatus = most recent report within last 30 minutes
if no such report → display "Unknown"
lastUpdated = now() - created_at of most recent report
```

### Real-Time Flow
1. User taps button → `INSERT` into `reports` table
2. Supabase Realtime broadcasts the change
3. All connected clients update status display

### Phase Breakdown

**Phase 1 — Core (MVP)**
- Next.js project scaffold
- Supabase project + `reports` table
- Status display component with staleness logic
- Four report buttons with Supabase insert
- Realtime subscription for live updates

**Phase 2 — Insights**
- Quantity Audit info card (static)
- Predictive heat map (hardcoded historical data)

**Phase 3 — Polish**
- Dark mode + UIUC/Chipotle color tokens
- Mobile layout optimization
- Tap animation feedback
- PWA manifest for home screen install

---

## 9. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Low adoption — no one submits reports | High | Critical | Seed the app during lunch rush; share in class group chats; make submission < 3 seconds |
| Report spam / bad data | Medium | Medium | Submissions are anonymous and cheap; bad data self-corrects as others report real status. Rate-limit to 1 report/user/5 min (IP-based, v1.1) |
| Supabase free tier limits | Low | Low | Free tier handles 50,000 MAU easily for a single-location app |
| Stale data shown as fresh | Low | High | Hard 30-minute expiry baked into display logic; no trust in old data |
| Data cold start (no reports yet) | Certain at launch | Medium | Default "Unknown" state is handled gracefully with clear CTA |

---

## 10. Out-of-Scope (Explicitly)

- Push notifications
- Report verification or trust scoring
- Multiple locations
- Chipotle corporate involvement
- Historical trend analytics dashboard
- User profiles or rep systems

---

## PRD Score (Self-Assessment)

| Dimension | Score | Notes |
|---|---|---|
| AI-Specific Optimization | 22/25 | Clear requirements, FR format ready for code generation |
| Traditional PRD Core | 23/25 | All standard sections present, quantified where possible |
| Implementation Clarity | 28/30 | Stack, data model, phase plan, and state logic all specified |
| Completeness | 18/20 | Non-goals and risks well-defined; v1 scope is tight |
| **Total** | **91/100** | |

---

*Ready for implementation. Next step: scaffold Next.js project and Supabase schema.*
