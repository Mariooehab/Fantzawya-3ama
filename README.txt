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
