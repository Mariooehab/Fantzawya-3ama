FANTZAWYA 3AMA — UPDATED PROJECT

1) Extract this folder.
2) Keep firebase.js configured with your Firebase project settings.
3) Run with a local web server (VS Code Live Server) or deploy to your hosting.
4) The AI assistant uses the Cloudflare Worker URL configured in ai.js.
5) Do not open index.html directly as a file; use localhost or HTTPS.

Updated in this build:
- Tablet sidebar vertical scrolling and responsive overrides.
- AI launcher in the desktop sidebar and mobile navigation menu.
- AI panel open/close wiring for both launchers.
- Removed stray character from the supplied AI script and guarded missing elements.

If Firebase Auth/Firestore rules or Cloudflare Worker secrets are not configured, those backend features still need their existing project settings.
