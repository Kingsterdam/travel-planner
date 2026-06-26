import type { ItineraryPlan, LegPlan } from './types';

/**
 * Generates all ways to split `totalDays` among `numStops` countries,
 * each stop getting at least `minStay` days.
 *
 * Equivalent to "stars and bars": number of results is C(totalDays - 1, numStops - 1)
 * when minStay = 1.
 */
export function generateStayDistributions(
  totalDays: number,
  numStops: number,
  minStay = 1
): number[][] {
  const results: number[][] = [];

  if (numStops <= 0) return results;

  function helper(remaining: number, slotsLeft: number, current: number[]) {
    if (slotsLeft === 1) {
      if (remaining >= minStay) {
        results.push([...current, remaining]);
      }
      return;
    }
    const maxForThis = remaining - minStay * (slotsLeft - 1);
    for (let days = minStay; days <= maxForThis; days++) {
      helper(remaining - days, slotsLeft - 1, [...current, days]);
    }
  }

  helper(totalDays, numStops, []);
  return results;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Generates every valid itinerary plan (start date x stay distribution) for
 * a fixed sequence of countries/airports.
 *
 * @param countries airport codes in travel order, e.g. ["DEL", "GYD", "TBS", "EVN"]
 * @param rangeStart earliest possible departure date (YYYY-MM-DD)
 * @param rangeEnd latest possible date by which the whole trip (incl. return) must finish (YYYY-MM-DD)
 * @param totalDays total length of the trip in days, across all intermediate stops
 * @param returnHome whether to add a final leg back to countries[0]
 */
export function generateItineraryPlans(
  countries: string[],
  rangeStart: string,
  rangeEnd: string,
  totalDays: number,
  returnHome = true
): ItineraryPlan[] {
  if (countries.length < 2) return [];

  const numStops = countries.length - 1; // number of intermediate legs (excluding return)
  const distributions = generateStayDistributions(totalDays, numStops);

  const start = new Date(`${rangeStart}T00:00:00Z`);
  const end = new Date(`${rangeEnd}T00:00:00Z`);
  const msPerDay = 86400000;
  const totalRangeDays =
    Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
  const latestStartOffset = totalRangeDays - totalDays; // M - D + 1 valid offsets (0-indexed)

  const plans: ItineraryPlan[] = [];

  if (latestStartOffset < 0 || distributions.length === 0) {
    return plans;
  }

  for (let offset = 0; offset <= latestStartOffset; offset++) {
    const startDate = new Date(start.getTime() + offset * msPerDay);

    for (const dist of distributions) {
      const legs: LegPlan[] = [];
      let cursor = new Date(startDate);

      for (let i = 0; i < countries.length - 1; i++) {
        legs.push({
          origin: countries[i],
          destination: countries[i + 1],
          date: toISODate(cursor),
        });
        if (i < dist.length) {
          cursor = new Date(cursor.getTime() + dist[i] * msPerDay);
        }
      }

      if (returnHome) {
        legs.push({
          origin: countries[countries.length - 1],
          destination: countries[0],
          date: toISODate(cursor),
        });
      }

      plans.push({
        startDate: toISODate(startDate),
        stayDistribution: dist,
        legs,
      });
    }
  }

  return plans;
}
