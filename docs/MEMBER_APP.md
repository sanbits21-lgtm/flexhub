# Member web app (PWA)

Members can use FlexHub from their phone's browser and install it to the home screen, instead
of (or as well as) the native app. It is a section of the same website, so there is nothing
extra to deploy.

## Where it lives
- **Address:** `https://<your-site>/member` (on a gym's own address, `https://<gym>.<your-domain>/member`).
- **Sign in:** member code or email, and the password staff create with *App login / reset* on the
  Members page. The login popup shows the address to hand to the member.
- Staff keep using the website as before. A staff session and a member session in the same
  browser never mix (separate sessions).
- Opening a page while signed out (for example a bookmarked **My pass**) sends the member to sign
  in, then straight back to that page.

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

## Staying signed in
- A member stays signed in until they have **not opened the app for 30 days** (or 180 days in
  total), even though each request's short-lived key lasts only 15 minutes. The app renews it
  quietly in the background; the member never sees this.
- **Sign out** is on the Profile screen, and so is **Sign out of all devices**.
- Changing the password signs the member out on every *other* phone and browser, not the one they
  are using. Staff re-issuing the app login, or the member deleting their account, signs them out everywhere.
- **Five wrong passwords lock that member code for 15 minutes** (longer if it keeps happening). The
  right password is refused while locked. Staff can still re-issue the login.
- New passwords must not be common or guessable (for example `Password123!`) and must not contain
  the member's own name, email or phone number.
- Technical detail: the long-lived part is a cookie the page cannot read; see [SECURITY.md](./SECURITY.md).

## Offline
The app shell is cached, and each screen keeps its last good copy on the phone, so a workout plan
or schedule opens without signal (with an "offline" note). With no signal the member **stays
signed in**: the app only signs them out if the server explicitly refuses, never because the
connection dropped. The first request after signal returns renews the session by itself.
Anything that must be current (the entry pass, saving changes) needs a connection.

## Not in the web app
Push notifications and the staff screens of the native app (those use the website). The native
app remains available and uses the same accounts and data.

## Notes for the gym
- Staff create the login; members cannot sign themselves up or reset a forgotten password.
- Deleting an account in the app erases the member's personal data; the gym keeps its payment and
  attendance records.
- A gym that is **suspended** locks its members out. A gym whose **plan or trial has ended** does
  not: members are never penalised for the gym's billing.
