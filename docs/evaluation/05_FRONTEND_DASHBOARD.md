# Doc 5 — Frontend & User Interface
### Person 5 Preparation Sheet | SIH 2026 · LATENT

> **Your job in the presentation:** Show the judges how the QA engineer
> actually uses the system day-to-day. Be ready to navigate the UI live
> and explain every element on screen.

---

## 1. Tech Stack

| Technology | Why We Chose It |
|------------|----------------|
| **Next.js 16** | Server-side rendering, file-based routing, and Turbopack for sub-second hot reload |
| **React 19** | Latest concurrent rendering for smooth, non-blocking UI updates |
| **TypeScript** | Full type safety across the entire frontend — prevents runtime errors |
| **Framer Motion** | Smooth stagger animations that make the UI feel alive and premium |
| **Recharts / D3** | Custom line charts with batch envelopes — not possible with simple chart libraries |
| **SWR** | Smart data fetching with caching, deduplication, and background revalidation |
| **Lucide React** | Consistent icon library |
| **Bklit Gauge Chart** | Custom workspace component for the animated gauge charts |

**Project Location:** `hail mary/apps/web/`  
**Start Command:** `npm run dev` from the `hail mary/` directory  
**Port:** `http://localhost:3000`

---

## 2. Page-by-Page Walkthrough

### Page 1: Dashboard / Lot Overview (`/`)
**File:** `hail mary/apps/web/app/page.tsx`

This is the QA engineer's command center. It shows all manufacturing lots and
their overall health at a glance.

Key elements to point out:
- **Lot cards** with color-coded defect rate indicators
- **Scatter plot** showing all components in the selected lot — x-axis is lot
  component index, y-axis is leakage current. Defective components appear as
  red dots far from the cluster.
- **Clicking any dot** takes the user to the Component Deep-Dive.

**What to tell judges:** *"This gives a QA engineer an instant lot-level health
summary. The scatter plot replaces a spreadsheet of 300 rows — anomalies are
immediately visible."*

---

### Page 2: Component Deep-Dive (`/components/[id]`)
**File:** `hail mary/apps/web/app/components/[id]/page.tsx`

This is the most important page. It shows everything about a single flagged component.

**Layout order (top to bottom):**

#### A. Header
- Component ID (e.g., `LOT_021_C0378`)
- Lot ID and ground-truth defect type
- Quick recommendation badge (REJECT / ACCEPT / MANUAL REVIEW)

#### B. Screening Verdict (top card)
The most prominent element. A large colored card with:
- **Shield icon:** `ShieldX` (red) for REJECT, `ShieldCheck` (green) for CLEARED,
  `ShieldAlert` (amber) for MANUAL REVIEW
- **Verdict label:** "REJECTED" / "CLEARED" / "MANUAL REVIEW" in 30px bold text
- **Subtitle:** Human-readable explanation of why this verdict was reached
- **Two pills:** One for Module A signal (Z-score), one for Module B signal
  (Drift Ratio multiplier)

*Why it's at the top:* A QA engineer checking 200 components needs to know the
verdict immediately. They can scroll down for details if they want to investigate.

#### C. AI Disposition Summary
- Bullet-point list generated from the backend's SHAP explanation
- Written in plain English, not technical jargon

#### D. Parametric Trajectory Charts
Two side-by-side line charts — one for Leakage Current, one for Propagation Delay.

Each chart shows **three lines:**
1. **This component** (bright colored line — var(--chart-1))
2. **Batch median** (blue dashed line — the typical component in this lot)
3. **±2 MAD Envelope** (faint white lines — the "normal range")

If the component's line exits the envelope, it is visually obvious. The `%
vs batch median` badge appears automatically when the deviation exceeds 20%.

#### E. Module A — Anomaly Detection Card
- Status banner (ANOMALOUS / Normal) with color coding
- **Animated Gauge chart** showing the Z-score (scale: 0–25)
- Scale label: "Scale: 0 – 25 z-score" beneath the gauge
- "Why Flagged" section with bullet points from `anomaly.justification`

#### F. Module B — Drift Prediction Card
- Status banner (Safety-slope REJECTED / PASSED) with color coding
- **Animated Gauge chart** showing the Drift Ratio (scale: 0–2× threshold)
  - A gauge reading of 1× means the component is exactly at the limit
  - A gauge reading above 1× means it is over the limit
- Scale label: "Leakage Drift · Scale: 0 – 2× threshold"
- Per-Parameter Forecast table with Drift Ratio column (red if over 1×, green if under)

---

### Page 3: Rejection Simulator (`/simulator`)
**File:** `hail mary/apps/web/app/simulator/page.tsx`

This page is for live demonstration. A judge or evaluator can type in their
own 0h and 24h readings, pick a lot, and see what the AI would decide.

Key elements:
- **Form inputs:** `Leak 0h`, `Leak 24h`, `Delay 0h`, `Delay 24h` (µA and ns)
- **Lot selector dropdown:** Pulls all lots from the backend
- **Predict button:** Sends `POST /api/simulate/` to the backend
- **SHAP waterfall chart:** Shows exactly which feature drove the prediction
- **Animated number counters** using `@number-flow/react`

**What to tell judges:** *"We can demonstrate the AI right now with any numbers
you give us. Let's type in a 48 µA baseline in a 10 µA lot and watch the system
flag it in real-time."*

---

### Page 4: Live Monitor (`/monitor`)
**File:** `hail mary/apps/web/app/monitor/page.tsx`

This page shows a **real-time WebSocket stream** simulating live data coming
from the burn-in oven. Every second, the chart updates with a new sensor reading.

Key elements:
- Live line chart updating at 1 Hz
- Component selector to watch individual parts
- Connection status indicator

---

### Page 5: Evaluation Report (`/evaluation`)
**File:** `hail mary/apps/web/app/evaluation/layout.tsx`

Displays the auto-generated evaluation metrics pulled directly from the backend.

---

## 3. Design Decisions to Highlight

**Dark theme with colored glows:** Designed for low-ambient-light factory floors
where screens need to be readable without eye strain.

**Animated gauges:** The gauges animate from 0 to the correct value on load. This
draws the eye to the key number immediately. The color (green/red) is visible at
a glance even from across the room.

**Stagger animations (Framer Motion):** Each card fades in slightly after the
previous one (`staggerChildren: 0.08`). This prevents cognitive overload — the
user sees the verdict first, then the charts, then the details, progressively.

---

## 4. Soundbites for Judges

- *"Every design decision on this UI was made for one user: the QA inspector
  who needs to process 300 components per lot before signing off on a satellite.
  We reduced that to seconds per component, not minutes."*
- *"The trajectory charts don't just show the component — they show the entire
  batch statistical envelope behind it. The anomaly is immediately visible without
  any numbers."*
- *"The Simulator page lets any evaluator enter their own readings and see the
  AI's decision in real-time. It's our most powerful live demonstration tool."*
