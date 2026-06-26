# Multi-City Trip Finder

A Next.js app that finds the cheapest continuous multi-country flight itineraries
(e.g. India -> Azerbaijan -> Georgia -> Armenia -> India) by:

1. Generating all valid combinations of start dates and stay-length distributions
   for your trip.
2. Deduplicating them into a minimal set of unique (origin, destination, date) flight
   searches.
3. Fetching cheapest fares for each unique leg-date from the Kiwi Tequila API
   (free, self-serve tier).
4. Reassembling full itineraries from the cached leg results and ranking by total price.

> Note: this project originally used the Amadeus Self-Service API, which Amadeus
> is decommissioning on July 17, 2026. It has been switched to Kiwi's Tequila API,
> which is self-serve (instant API key, no approval queue) and is specifically
> built for flexible/multi-city itinerary search.

## 1. Get a free Kiwi Tequila API key

1. Go to https://tequila.kiwi.com and register.
2. Create an app — you get an `apikey` immediately, no approval wait.
3. The free tier is rate-limited but real (covers ~750 carriers including
   250+ low-cost carriers) — good for building and demoing. For high-volume
   production use you'd discuss a commercial agreement with Kiwi.

## 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```
TEQUILA_API_KEY=your_tequila_api_key_here
```

## 3. Install dependencies

```bash
npm install
```

## 4. Run the dev server

```bash
npm run dev
```

Open http://localhost:3000

## 5. Using the app

- **Airport codes**: enter IATA airport codes in travel order, comma-separated.
  Example for India -> Azerbaijan -> Georgia -> Armenia -> back to India:
  `DEL,GYD,TBS,EVN`
  (the app automatically adds the final return leg back to the first airport)
- **Earliest start date / Latest end date**: the window within which the trip
  could start and must fully finish (e.g. all of October).
- **Total trip length (days)**: total number of days for the whole trip across
  all countries.

The app will:
- Generate every valid way to split the total days across the countries (min 1 day each)
- Generate every valid start date in your window
- Search Kiwi once per unique (route, date) pair — NOT once per itinerary
- Re-assemble and return the 10 cheapest valid itineraries

## Important notes / things to extend for production

- **Airport codes vs city/country names**: this MVP expects raw IATA airport
  codes. For a real product, add an autocomplete using Tequila's
  "locations" endpoint so users can type "Baku" and get `GYD`.
- **Caching**: the included cache is in-memory (`Map`) and resets on server
  restart / per serverless instance. For real deployments, swap in Redis
  (e.g. Upstash, which has a free tier) — the cache interface in
  `lib/kiwi.ts` is intentionally simple to swap out.
- **Rate limits**: Tequila's free tier has per-minute/per-day caps. The
  orchestrator batches requests (`BATCH_SIZE` in
  `lib/search-orchestrator.ts`) to stay polite; tune this if you hit 429s.
- **Stay length granularity**: the combinatorics function enforces a minimum
  of 1 day per stop. You can raise `minStay` in
  `lib/itinerary-generator.ts` if you want to disallow 1-day stopovers.
- **Large search spaces**: for long total trip durations across many
  countries/wide date windows, the number of unique leg-dates can still get
  large. Consider capping `rangeEnd - rangeStart` or `totalDays` in the UI,
  or adding pagination/progressive loading.
- **Swapping providers again**: every provider-specific code lives in
  `lib/kiwi.ts` behind one function, `searchFlights(origin, destination, date)`.
  To switch to a different provider later (Duffel, Skyscanner via RapidAPI,
  etc.), just write a new file with that same function signature and update
  the one import in `lib/search-orchestrator.ts`.

## Project structure

```
travel-planner/
├── app/
│   ├── page.tsx                       # Frontend UI
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       └── search-multicity/
│           └── route.ts               # API route (backend)
├── lib/
│   ├── kiwi.ts                        # Kiwi Tequila auth + flight search + cache
│   ├── itinerary-generator.ts         # Date/stay combinatorics
│   ├── search-orchestrator.ts         # Dedup, fetch, assemble, rank
│   └── types.ts
├── .env.local.example
├── package.json
└── tsconfig.json
```
