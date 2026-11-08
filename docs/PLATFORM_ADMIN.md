# Platform guide: packages, approvals, plans and renewals

For the people who run FlexHub itself (super-admins and platform admins), not for gym owners.

## Who can do what

| | Super-admin | Platform admin |
|---|---|---|
| See packages | yes | yes |
| Create, edit, hide, delete packages | **yes** | no |
| Platform Settings (trial terms, self-registration on/off) | **yes** | no |
| Approve or reject new gyms, "Approve anyway" | yes | yes |
| Edit a gym, move it to a package, renew it | yes | yes |

A platform admin scoped to particular gyms only sees and acts on those gyms.

## Subscription packages

A package is a plan a new gym can choose on the registration page. Set them up under
**Packages** in the menu (the super-admin manages them; a platform admin sees the same list
read-only).

| Field | Meaning |
|---|---|
| Name, short description, highlights | Shown on the registration page (up to 10 highlight lines). |
| Price (₹, 0 = free) and **Billed every N months** | Shown as, e.g., "₹1,499 / 6 months". Any whole number of months from 1 to 60; quick buttons for Monthly, Quarterly, Every 6 months and Yearly. **Display only: nothing is charged by the app.** |
| Free trial days | `0` means no trial: the package is live as soon as you approve the gym. |
| Branches allowed, members allowed (or *Unlimited*) | The limits the gym gets on approval. |
| Most popular, order on the page | Cosmetic. |
| Offered on the registration page | Untick (or use **Hide**) to stop new gyms choosing it. Gyms already on it keep it. |

- **Editing a package affects future approvals only.** Gyms already approved keep what they were given.
- **Delete** only works for a package no gym has chosen or holds; otherwise hide it.
- If you create **no packages**, registration works as before: the plain free trial from Platform
  Settings (days, member limit, branch limit).

## The registration page

`/signup` lists the active packages as cards. Once any package exists, choosing one is required.
Registering creates a gym that is **waiting**: nobody can sign in until both happen:

1. The owner confirms their email (link valid 24 hours; "send again" is available).
2. You approve the gym.

You are emailed when a confirmed registration is waiting, with the package they chose.
Registering with an email that already has an account creates nothing: the page answers exactly
as for a new registration, and that address gets an email saying it already has an account
(see SECURITY.md).

## Approving a gym

**Tenants > Pending approval** shows each waiting gym with owner, phone, the package it chose
and whether the email is confirmed. Before approving you can:

- pick a **different package** (the numbers below refill from it);
- change **Trial days, Members, Branches** for this one gym (leave Members blank for unlimited).

Then **Approve** (or **Reject** with an optional reason the owner will see; a rejected gym can be
approved later).

**What the gym gets**

- A package **with** trial days: a free trial that starts now, with the package's limits.
- A package **without** trial days: live now as a paid plan, running for one billing period.
- No package: the platform's plain trial.

The owner is emailed and can sign in.

### "Approve anyway" (email never confirmed)

If the owner has not confirmed their email (for example, email delivery is not set up yet), the
button reads **Approve anyway**. It asks you to confirm, then marks the email as confirmed on their
behalf so they can sign in. Only use it when you know the gym is genuine. The audit log records
that you did it. If email is not set up, **tell the owner yourself**: they sign in with the email
and password they registered with.

## Moving an existing gym onto a package

**Tenants > Edit > Package.** The gym gets the package's limits and becomes a live paid plan
now (no new trial), and its plan end is set to one billing period from today. If you do not
change the package dropdown, ordinary edits leave limits and plan end alone.

Moving to a smaller package never removes anything the gym already has: it only stops them adding
more until they are under the limit.

## Plan end, grace and the read-only lock

| Situation | What happens |
|---|---|
| **Trial ends** | Owner and staff can still sign in and **view** everything but cannot change anything (HTTP 402, `TRIAL_ENDED`). |
| **Paid plan ends** | Everything keeps working for **3 more days**, with a warning banner. Then the same read-only lock (`PLAN_EXPIRED`). |
| **Gym suspended** | Locked out completely. |
| **Gym with no end date** | Never expires (gyms you created by hand before plans existed). To start expiring a paid-plan gym, set **Edit > Plan ends**; for a trial gym use **+7 days** (or Renew). |

Members of a gym are never locked out because of billing, only if the gym is suspended.

The **Ends** column on the Tenants list shows each gym's end date: amber within 7 days, red once passed.

## Renewing

**Tenants > Renew** (for a trial gym the button is **Activate plan**). Enter the **months** and the
**amount received** (both prefilled from the gym's package), then **Record and renew**.

- If the plan **has already ended**, the new period runs from **today**.
- If it is **still running**, the new period is added **after the current end**, so paying early loses nothing.
- A **trial** gym becomes a paid gym.
- A **paid invoice** is recorded (it counts toward the platform dashboard's monthly total), the
  owner is emailed, and reminders start over for the new end date.

Payment itself happens outside the app (UPI, bank transfer, cash). The app only records it.

## Plan-ending reminders

The server checks every 6 hours and emails each gym's owners (or the contact address if there is no
owner):

| When | Email |
|---|---|
| 7 days or fewer before the end | "Your plan/trial ends in N days" |
| 1 day or fewer | "ends tomorrow" |
| When it ends | "has ended" (and, for a paid plan, how many grace days remain) |

Each reminder goes out **once per end date**. You also get **one summary email** listing the gyms
just reminded (a scoped platform admin only sees their own gyms). Suspended, unapproved and
no-end-date gyms are skipped, as are plans that ended more than 30 days ago.

Reminders need email set up (see CONFIGURATION.md). Set `EXPIRY_NOTICES=off` to stop them; the
read-only lock still applies. The owner also sees a banner inside the app once a plan has 7 days left.

## Editing a gym: what is checked

The Tenants edit form (and the API behind it) now rejects values that used to be stored as typed:
a branch limit outside 1 to 100, an unknown plan or status, an invalid email, a name that is empty,
dates that are not real or are more than 10 years ahead, or a package that does not exist. The
form shows the reason.

## Troubleshooting

**"I set up packages but they are not on the live site."** Check these in order:
1. **Packages are data, not code.** They live in the database. A deploy does not carry over what
   you created on your own computer: if the live site uses a different database (a different
   `MONGODB_URI`), create the packages again there, signed in as the super-admin on the live site.
2. **Your browser may still be showing the old version.** The website installs itself like an app
   and updates only when asked. After a deploy, click **Update** on the "new version available"
   bar, or hard-refresh (Ctrl+Shift+R), or close and reopen the installed app.
3. **Which account?** **Packages** is in the menu for super-admins and platform admins. Only a
   super-admin can add or change them; others see the list without edit buttons. Gym owners never
   see it.
4. **Did the deploy finish?** `https://<your-site>/health` should answer `{"status":"ok"}` and the
   Render logs should show "Server running". A deploy that keeps restarting is still serving the
   previous version.
5. **Is sign-up showing them?** The registration page lists only packages that are **offered**
   (not hidden), and only while self-registration is on in Platform Settings.

## Email
Gyms cannot register without working email (confirmation links), and approvals, renewals and reminders
are emailed too. **Platform Settings > Email** (super-admin) shows whether email is set up, whether the
mail server accepts the login, the reason for the last failure, and sends a test message to you.
If a visitor sees "We couldn't send your confirmation email", look there first. Fixes by symptom:
[RENDER.md](./RENDER.md#if-sign-up-says-we-couldnt-send-your-confirmation-email).

## Known limits

- **No payment gateway.** Prices are informational; renewals are recorded by hand.
- A package **without a trial** is stored with the plan value "basic" (the package name is shown beside it).
- The member-count and branch limits are checked when someone **adds** a member or branch, not
  retroactively.
