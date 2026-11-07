# Member web app (PWA)

Members can use FlexHub from their phone's browser and install it to the home screen, instead
of (or as well as) the native app. It is a section of the same website, so there is nothing
extra to deploy.

## Where it lives
- **Address:** `https://<your-site>/member` (on a gym's own address, `https://<gym>.<your-domain>/member`).
- **Sign in:** member code or email, and the password staff create with *App login / reset* on the
  Members page. The login popup shows the address to hand to the member.
- Staff keep using the website as before. A staff session and a member session in the same
  browser never mix (separate tokens).

## What members get (same as the native app)
Home (membership days left, visits, next session) · Sessions (personal training, classes, cancel) ·
Workout and Diet (plan from the trainer, or make your own) · My gym (trainers, equipment) ·
Profile (photo, details, goals, password, theme, delete account) · My pass (rotating QR for the
front desk; needs *QR check-in* on) · Payments (receipts; needs *Payment history in the member app* on).

## Installing
- **Android / Chrome:** open the address, then menu → *Install app* (or the install banner).
- **iPhone / Safari:** *Share* → *Add to Home Screen*.
The installed app is named after the gym and tinted with its brand colour
(`/member.webmanifest` is generated per gym address).

## Offline
The app shell is cached, and each screen keeps its last good copy on the phone, so a workout plan
or schedule opens without signal (with an "offline" note). Anything that must be current (the entry
pass, saving changes) needs a connection.

## Not in the web app
Push notifications and the staff screens of the native app (those use the website). The native
app remains available and uses the same accounts and data.

## Notes for the gym
- Staff create the login; members cannot sign themselves up or reset a forgotten password.
- Deleting an account in the app erases the member's personal data; the gym keeps its payment and
  attendance records.
