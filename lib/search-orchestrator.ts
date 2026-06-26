import { searchFlights, searchFlightsNearestDate } from './travelpayouts';
import { generateItineraryPlans } from './itinerary-generator';
import { fetchLiveItinerary } from './flight-search-live';
import type { RankedItinerary } from './types';

const BATCH_SIZE = 8;

// How many of the top-ranked itineraries to confirm with the live API.
// Keep this small — each one takes several seconds and counts against rate limits.
const LIVE_CONFIRM_COUNT = 10;
const LIVE_CONFIRM_CONCURRENCY = 3;

export async function searchMultiCity(
  countries: string[],
  rangeStart: string,
  rangeEnd: string,
  totalDays: number,
  returnHome = true,
  topN = 10
): Promise<{ results: RankedItinerary[]; totalItineraries: number; uniqueLegSearches: number }> {
  const plans = generateItineraryPlans(
    countries,
    rangeStart,
    rangeEnd,
    totalDays,
    returnHome
  );

  // 1. Collect unique (origin, destination, date) lookups across ALL candidate itineraries.
  const uniqueLegs = new Map<
    string,
    { origin: string; destination: string; date: string }
  >();
  for (const plan of plans) {
    for (const leg of plan.legs) {
      const key = `${leg.origin}|${leg.destination}|${leg.date}`;
      if (!uniqueLegs.has(key)) {
        uniqueLegs.set(key, leg);
      }
    }
  }

  // 2. Fetch all unique leg-dates, batched. (Cheap month-matrix calendar data —
  //    used only for ranking, NOT for the final booking link or stop names.)
  const legKeys = Array.from(uniqueLegs.keys());
  const legResults = new Map<string, Awaited<ReturnType<typeof searchFlights>>>();

  for (let i = 0; i < legKeys.length; i += BATCH_SIZE) {
    const batch = legKeys.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((key) => {
        const { origin, destination, date } = uniqueLegs.get(key)!;
        return searchFlightsNearestDate(origin, destination, date, 7);
      })
    );
    batch.forEach((key, idx) => legResults.set(key, batchResults[idx]));
  }

  // 3. Reassemble each itinerary from cached leg results.
  const assembled: RankedItinerary[] = [];

  for (const plan of plans) {
    let totalPrice = 0;
    let currency = 'INR';
    let missingLegs = 0;

    const legsWithOffers = plan.legs.map((leg) => {
      const key = `${leg.origin}|${leg.destination}|${leg.date}`;
      const offers = legResults.get(key) ?? [];
      const cheapest = offers[0] ?? null;
      if (!cheapest) {
        missingLegs++;
      } else {
        totalPrice += cheapest.price;
        currency = cheapest.currency;
      }
      return { ...leg, offer: cheapest };
    });

    if (missingLegs === 0) {
      assembled.push({
        startDate: plan.startDate,
        stayDistribution: plan.stayDistribution,
        totalPrice,
        currency,
        legs: legsWithOffers,
      });
    }
  }

  // 4. Rank by total price.
  assembled.sort((a, b) => a.totalPrice - b.totalPrice);

  const top = assembled.slice(0, topN);

  // 5. Confirm the top results against the REAL-TIME flight_search API.
  //    This is what gives us: an actual bookable deep link, and the real
  //    layover airport codes/names instead of just a stop count.
  await confirmWithLiveApi(top);

  return {
    results: top,
    totalItineraries: plans.length,
    uniqueLegSearches: legKeys.length,
  };
}

/**
 * Mutates each itinerary in place, adding liveBookingUrl / liveAgencyName /
 * per-leg realStops where the live API returns a result. If the live API
 * fails or returns nothing for an itinerary, liveConfirmed is still set to
 * true so the UI knows to fall back to the per-leg "Book" links and the
 * generic stop-count badge instead of silently looking broken.
 */
async function confirmWithLiveApi(itineraries: RankedItinerary[]) {
  console.log('[search-orchestrator] confirmWithLiveApi called with', itineraries.length, 'itineraries');
  const marker = process.env.TRAVELPAYOUTS_MARKER;
  if (!marker) {
    console.warn(
      '[search-orchestrator] TRAVELPAYOUTS_MARKER not set — skipping live confirmation, booking links will fall back to generic search links.'
    );
    return;
  }

  const slice = itineraries.slice(0, LIVE_CONFIRM_COUNT);

  for (let i = 0; i < slice.length; i += LIVE_CONFIRM_CONCURRENCY) {
    const batch = slice.slice(i, i + LIVE_CONFIRM_CONCURRENCY);
    await Promise.all(
      batch.map(async (itin) => {
        try {
          const live = await fetchLiveItinerary(
            itin.legs.map((l) => ({
              origin: l.origin,
              destination: l.destination,
              date: l.date,
            })),
            marker
          );

          itin.liveConfirmed = true;

          if (!live) return; // no live offer found — leave fallback fields in place

          itin.liveBookingUrl = live.bookingUrl;
          itin.liveAgencyName = live.agencyName;

          // Attach real stop airports per leg, where available
          itin.legs.forEach((leg, idx) => {
            const stops = live.stopsPerSegment[idx];
            if (stops) leg.realStops = stops;
          });
        } catch (e) {
          console.error('[search-orchestrator] live confirmation failed for itinerary', e);
          itin.liveConfirmed = true; // mark attempted, fall back gracefully
        }
      })
    );
  }
}