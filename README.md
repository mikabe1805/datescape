# DateScape

**DateScape** is a gamified dating web app prototype that blends social matching with exploratory, game-like interactions.

---

## Tech Stack
- **Frontend:** React, TypeScript, TailwindCSS, custom CSS animations
- **Backend/Cloud:** Firebase (Authentication, Firestore, Storage, Hosting)
- **Other Tools:** Vite, Node.js, Git, Figma

---

## Key Features
- Swipe-based matching with real-time preference filtering
- Multi-step sign-up with profile prompts, photo/video uploads, and demographic options
- Immersive UI with animated interactions and parallax effects
- In-app chat with file upload and voice message support (Firebase storage)
- Notification system with SendGrid/Twilio integration (email & SMS)

---

## Architecture Highlights
- Modular React components (`MatchQueue`, `MatchList`, `Chat`, etc.)
- Firestore data model for users, matches, and messages
- Cloud Functions for notifications and background tasks
- UI/UX design inspired by “glassy/liquid” aesthetics with animated effects

---

## Setup & Run
1. Clone the repo  
   ```bash
   git clone https://github.com/your-username/datescape.git
2. Install dependencies
   npm install
3. Start local dev server
   npm run dev
4. Configure Firebase (see /firebase directory)

## Status
This is a prototype project built to explore gamified social apps.
Some functionality and assets are redacted for demo purposes.
