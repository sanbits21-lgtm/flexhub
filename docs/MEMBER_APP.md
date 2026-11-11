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

## The front-desk QR code
Owners and branch managers open **Member App QR** in the menu. It shows a QR code for the gym's member
app address, with buttons to **Print poster** (stick it at the front desk), **Show full screen** (hold the
manager's screen up to a member) and **Copy link**. A member points their phone camera at it, taps the
link, and lands on the member sign-in page. The code holds only the public address (no member data, never
expires) and signs nobody in. It is not the same as **My pass**, the member's own rotating code that the
desk scans to check them in.

## What members get (same as the native app)
Home (membership days left, visits, next session) · Sessions (personal training, classes, cancel) ·
Workout and Diet (plan from the trainer, or make your own) · My gym (trainers, equipment) ·
Profile (photo, details, goals, password, theme, delete account) · My pass (rotating QR for the
front desk; needs *QR check-in* on) · Payments (receipts; needs *Payment history in the member app* on).

## Progress and badges
**Progress** (from Home > *Progress & badges*) is private to the member. They log weight and, if they
know it, body fat, with a date and a note; the screen draws their weight over time and shows the change
since they started (BMI appears as a number only, never labelled). Measurements a trainer or manager
takes with them appear too and cannot be deleted by the member; the member can delete their own.

**Badges** are worked out from data the app already holds, each time it is opened, so nothing is stored:
visits (1, 10, 25, 50, 100, 250), weeks in a row with a visit (4, 12, 26), months as a member (3, 6, 12),
tracking (first measurement, a month of measurements), and body changes. Weight badges follow the
member's own goal: *lose fat* earns "down 2, 5, 10 kg", *build muscle* earns "up 2, 5 kg", other goals
earn none. Body-fat badges (down 2, 5 points) appear once a body-fat reading exists. Badges not yet
earned show how far off they are.

## Ratings (per-gym feature)
Off by default. A platform admin switches **Ratings of the gym and its trainers** on for a gym in its
feature list. Then, on **My gym**:
- A member rates the **gym** (1 to 5 stars, optional comment) after their first visit.
- A member rates a **trainer** who is assigned to them or has trained them.
- One rating per target; rating again replaces it, and it can be withdrawn.
- Members see the gym's **average only once 5 members have rated**, so a score never exposes one
  person. A trainer's score is **never shown to members**.
- Owners and branch managers see all scores and comments on **Ratings** in the menu. Comments are
  **anonymous**: the member's identity is stored only to stop double votes and is never returned.
- Trainers do not see ratings. Nothing here is shown to other members, and there is no feed yet.

The native (Expo) app has the same screens: **Progress & badges** on Home, the rating cards on **My gym**,
and, for owners and branch managers, **Ratings** under *More* (shown only when the feature is on).

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
