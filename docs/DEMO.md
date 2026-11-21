# The demo gym

A fictional gym called **FitzyClub** with six months of history, for showing the product to prospects, filming the demo videos,
taking screenshots, and trying things out. It lives in its own database, so your real data is never touched.

## What is in it

3 branches in Bengaluru, an owner, 3 managers, 7 trainers and 4 other staff, 4 membership plans, about 600 members (roughly 450
active) who joined, renewed or lapsed over the six months, the payment for every term, 20,000 check-ins, 1,000 classes with
12,000 bookings, 250 personal training sessions, expenses and monthly payroll, 33 pieces of equipment (some overdue for service),
five notices and 230 ratings. Collections grow from about 3.5 lakh in the first month to over 8 lakh a month, and the gym runs at
a profit, so the reports and the Expenses screen look like a real business.

Everyone is fictional. The random seed is fixed, so rebuilding it gives the same data.

## Use it

```bash
npm run demo:seed  --prefix backend     # build (or rebuild) it
npm run build      --prefix frontend    # once, so the server can show the website
npm run demo:serve --prefix backend     # then open http://localhost:5100
```

| Sign in as | Email | Password |
|---|---|---|
| Owner | `owner@fitzyclub-demo.example.com` | `FitzyDemo#2026` |
| Branch manager | `meenakshi.rao@fitzyclub-demo.example.com` | same |
| Trainer | `karthik.shetty@fitzyclub-demo.example.com` | same |
| A member (member app, `/member`) | the member code the seed prints | same |

## Safety

- The seed writes **only** to a database whose name ends in `-demo` (your `MONGODB_URI` database with `-demo` added, or
  `MONGODB_URI_DEMO` if you set it). It refuses any other name.
- `demo:seed` empties that demo database first, so run it only against a database that exists for this purpose.
- The demo server (`demo:serve`) refuses to start against any database that does not end in `-demo`, and runs on port 5100, so it
  can sit beside your normal dev server on 5000.
- Records are written straight to the collections, without the app's save hooks, to keep it fast. Add data through the app, or
  through the seed, but do not mix the demo database with real use.

## Changing it

Everything is at the top of `backend/scripts/seedDemoGym.js`: branch names, staff and salaries, plan prices, how many members join
each month, the class timetable. Set `DEMO_PASSWORD` to use a different password.
