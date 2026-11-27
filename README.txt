FANTZAWYA 3AMA — EXPANDED COMMUNITY BUILD

1) Replace the entire old fantzawya-study-timer folder with this folder.
2) Firebase Console > Firestore Database > Rules: publish firestore.rules.
3) No Firebase Storage is used. Profile photos are saved as external image URLs in both users/{uid} and publicProfiles/{uid}.
4) Friends load current public profile data so updated names and photos appear after refresh/reopening Friends.
5) League: create a league, share its 8-character invite code, join with the code, add shared tasks, and view all-time study ranking for its members.
6) To-do & Notes: personal tasks and notes are stored in users/{uid}/todos and remain after logging out/reopening. Optional due date/time is shown as a reminder in the list.
7) All-time leaderboard sums completed studySessions saved since account creation.

IMPORTANT LIMITATIONS
- Study totals are based on client-created timer sessions and are not cheat-proof. Strong anti-cheat scoring and secure invite redemption require a trusted backend (Cloud Functions / server).
- Due reminders are displayed in the site; browser notifications while the site is closed are not implemented.
- Firestore Rules permit signed-in users to read league documents so invite-code lookup works. Use a backend callable function before using this for sensitive/private leagues.


8) FANTZAWYA AI ASSISTANT (Gemini + Firebase Cloud Functions)
   - The website UI calls a callable Cloud Function; the Gemini API key is stored as a Firebase Secret and is NOT placed in browser files.
   - Requirements: Firebase project on the Blaze plan for deployed Cloud Functions, Firebase CLI installed, and a Gemini API key.
   - From this folder, run: firebase login
   - Run: firebase use fantzawya-3ama
   - Run: firebase functions:secrets:set GEMINI_API_KEY
     Paste your Gemini API key when prompted. Never paste it into ai.js or share it in chat.
   - Run: cd functions && npm install && cd ..
   - Run: firebase deploy --only functions
   - Deploy the updated website files to your hosting as usual.
   - AI reads only the signed-in user's own To-do items and study-session summaries supplied by the browser, plus the exam date currently selected in the page. It does not write, delete, or edit tasks. It only suggests plans.
   - First use may incur Gemini API charges or quota limits depending on your Google AI account. Check current Gemini pricing and quotas before enabling for all members.
   - For production, enable Firebase App Check and set enforceAppCheck: true after configuring the web app.


9) FANTZAWYA AI — CLOUDFLARE WORKERS (NO FIREBASE BLAZE REQUIRED)
   IMPORTANT: Do NOT deploy Firebase Functions for this setup. The AI endpoint runs on Cloudflare Workers.
   A) Create/login to a Cloudflare account, open Workers & Pages, and create a Worker named fantzawya-ai.
   B) Deploy the contents of cloudflare-worker/src/index.js as the Worker code (or use Wrangler from the cloudflare-worker folder: npm create cloudflare@latest is not needed; install Wrangler with npm.cmd install -g wrangler, then run wrangler deploy).
   C) In Worker Settings > Variables and Secrets, add: GEMINI_API_KEY as a SECRET (your Google AI Studio Gemini API key); FIREBASE_API_KEY as a TEXT variable (copy apiKey from firebase.js); ALLOWED_ORIGIN as a TEXT variable (your exact website origin, e.g. https://example.com, with no trailing slash).
   D) If using the included wrangler.toml, replace YOUR-WEBSITE-DOMAIN and YOUR_FIREBASE_WEB_API_KEY before deploying. Set GEMINI_API_KEY with: wrangler secret put GEMINI_API_KEY. Do not put the Gemini key in source files.
   E) After deployment, copy the Worker URL (for example https://fantzawya-ai.YOUR-SUBDOMAIN.workers.dev) into AI_WORKER_URL in ai.js, replacing the placeholder. Upload the updated website files.
   F) The Worker verifies each Firebase ID token through Firebase Authentication before sending a prompt to Gemini. It does not use Firebase Cloud Functions or Secret Manager.
   G) AI only suggests study plans; it does not write/edit/delete Firestore tasks. Gemini usage may have quotas or charges depending on your Google AI account. Cloudflare free-plan limits also apply.
   H) Set ALLOWED_ORIGIN to the exact live site origin. If you test from localhost, temporarily set it to that exact localhost origin, then change it back for production.
   I) This starter Worker does not implement persistent per-user rate limiting. Add Cloudflare rate limiting before public launch to reduce abuse/cost risk.
