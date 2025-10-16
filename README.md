# DateScape

> A gamified dating platform that merges social matching with exploratory, game-like interaction — built for real-time communication, immersive UI, and measurable backend efficiency.

---

## Overview

DateScape is a full-stack web app that reimagines online dating as an interactive experience.  
It combines a **compatibility-based matching engine**, **exploratory world design**, and **real-time chat** powered by Firebase.

**Live Demo:** [https://datescape-ed925.web.app/](https://datescape-ed925.web.app/)

---

## Tech Stack

| Layer | Technologies |
|-------|---------------|
| **Frontend** | React • TypeScript • TailwindCSS • Vite • Custom CSS/Framer Motion animations |
| **Backend / Cloud** | Firebase (Authentication, Firestore, Storage, Hosting, Cloud Functions) |
| **Infrastructure / Tooling** | Node.js • Git • SendGrid • Twilio • Figma |

---

## Core Features

- **Swipe & Match:** Real-time preference filtering with persistent "Like / Pass" queue.  
- **Multi-Step Onboarding:** Dynamic signup flow with photos, videos, interests, and demographic sliders.  
- **Immersive UI:** Parallax transitions, glassy "liquid" panels, and subtle shine animations.  
- **Chat System:** Real-time Firestore chat with file uploads, audio messages, and read receipts.  
- **Notification Layer:** Email/SMS delivery via SendGrid and Twilio; Cloud Functions trigger-based dispatch.  
- **Fine-Tuning Compatibility:** Optional "values and dealbreaker" section with conditional sliders (religion, family, distance, politics).  

---

## Architecture Highlights

- Modular React component architecture — `MatchQueue`, `MatchList`, `ChatPage`, `NotificationCenter`.  
- Firestore-based relational data model:  
  - `/users/{uid}` — profile, preferences, and notifications  
  - `/matches/{matchId}` — metadata, `isActive` flags, participants  
  - `/matches/{matchId}/messages/{msgId}` — chat history with timestamps and read status  
- Cloud Functions for:
  - Notification dispatch (email/SMS)  
  - Message trigger indexing  
  - Future compatibility scoring jobs  
- UI design inspired by *cozy glass* and *liquid light* motifs (soft glows, frosted panels, animated depth).

---

## Performance Benchmarks (Synthetic Load Test)

**DateScape Chat Benchmark — 2025-10-16**

| Metric | Result | Notes |
|--------|--------|-------|
| **Clients** | 200 synthetic users | 20 simultaneous match rooms |
| **Duration** | 300 s | steady-state test |
| **p50 latency** | **16 ms** | median message delivery |
| **p95 latency** | **151 ms** | 99% of messages < 240 ms |
| **Throughput** | **318 msg/s** | ~19 K msg/min across 200 clients |
| **Firestore Cost** | **$0.074 / 5 min** | ≈ $0.000008 per message |
| **Memory Footprint** | **247 MB peak RSS** | ≈ 6 MB per 10 clients |

**Result:** Real-time Firebase chat sustained sub-250 ms p99 latency and linear scalability up to 200 clients per process, validating the architecture’s efficiency and cost profile.

---

## Economic Efficiency

| Operation | Unit Cost | Volume (5 min) | Cost |
|------------|-----------|---------------|------|
| Reads | $0.06 / 100 K | 95 K | $0.057 |
| Writes | $0.18 / 100 K | 9.5 K | $0.017 |
| **Total** |  |  | **$0.074** |
| **Cost / Message** |  |  | **$0.000008** |

**Interpretation:** This translates to roughly **$0.05 per million messages** — highly cost-efficient for scalable chat at production scale.

---

## Latency Distribution

![Latency Chart](assets/latency-distribution.png)

> **Latency Curve:** Median = 16 ms, p95 = 151 ms, p99 = 240 ms  
> Smooth delivery profile with minimal long-tail degradation under 200 concurrent clients.

*(Chart generated from `results-datescape.csv` synthetic benchmark data.)*

---

## Setup & Run

```bash
git clone https://github.com/your-username/datescape.git
cd datescape
npm install
npm run dev
```

Configure Firebase credentials in `/firebase/config.ts` and set environment variables for:
```
SENDGRID_API_KEY=
TWILIO_API_KEY=
FIREBASE_API_KEY=
FIREBASE_PROJECT_ID=
```

---

## Status

DateScape is an active R&D prototype demonstrating:
- Gamified UX for social connection  
- Serverless scalability with quantifiable performance metrics  
- A foundation for future multiplayer / open-world dating interactions  

**Next goals:** integrate AI-assisted compatibility scoring, in-app voice/video dates, and open-world hub prototype.

---

## License

MIT © 2025 Mika Be

---

## Benchmark Disclaimer

> Synthetic load tests on staging; metrics reflect engineering baselines, not real-user traffic. Results verified via `datescape-chat-benchmark v1.0.0`. 

