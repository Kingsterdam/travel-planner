import type { FlightOffer } from './types';

const TRAVELPAYOUTS_BASE_URL = 'https://api.travelpayouts.com';

// Cache key: `${origin}-${destination}-${YYYY-MM}` -> map of date -> FlightOffer[]
const monthMatrixCache = new Map<string, Map<string, FlightOffer[]>>();
const inFlightRequests = new Map<string, Promise<Map<string, FlightOffer[]>>>();

function getMonthKey(isoDate: string): string {
  return isoDate.slice(0, 7); // "YYYY-MM"
}

function getMonthStart(isoDate: string): string {
  return `${getMonthKey(isoDate)}-01`;
}

/**
 * Normalise any date string to strict YYYY-MM-DD with zero-padded month/day.
 * The Travelpayouts API sometimes returns dates like "2026-10-1" without zero-padding.
 */
function normDate(raw: string): string {
  const parts = raw.split('-');
  if (parts.length !== 3) return raw;
  const [y, m, d] = parts;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

async function fetchMonthMatrix(
  origin: string,
  destination: string,
  date: string
): Promise<Map<string, FlightOffer[]>> {
  const monthKey = getMonthKey(date);
  const cacheKey = `${origin}-${destination}-${monthKey}`;

  if (monthMatrixCache.has(cacheKey)) {
    return monthMatrixCache.get(cacheKey)!;
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const promise = fetchMonthMatrixUncached(origin, destination, date, cacheKey).finally(
    () => {
      inFlightRequests.delete(cacheKey);
    }
  );
  inFlightRequests.set(cacheKey, promise);
  return promise;
}

async function fetchMonthMatrixUncached(
  origin: string,
  destination: string,
  date: string,
  cacheKey: string
): Promise<Map<string, FlightOffer[]>> {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) {
    throw new Error(
      'Missing TRAVELPAYOUTS_TOKEN. Copy .env.local.example to .env.local and fill in your Travelpayouts API token.'
    );
  }

  const params = new URLSearchParams({
    currency: 'inr',
    origin,
    destination,
    month: getMonthStart(date),
    token,
  });

  const url = `${TRAVELPAYOUTS_BASE_URL}/v2/prices/month-matrix?${params.toString()}`;
  console.log(`[travelpayouts] fetching ${origin}→${destination} for ${getMonthKey(date)}`);

  const res = await fetch(url);

  const dateMap = new Map<string, FlightOffer[]>();

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(
      `[travelpayouts] month-matrix failed ${origin}->${destination} for ${getMonthKey(date)}: HTTP ${res.status} — ${text}`
    );
    monthMatrixCache.set(cacheKey, dateMap);
    return dateMap;
  }

  let json: any;
  try {
    json = await res.json();
  } catch (e) {
    console.error(`[travelpayouts] JSON parse error for ${origin}->${destination}:`, e);
    monthMatrixCache.set(cacheKey, dateMap);
    return dateMap;
  }

  if (!json?.success) {
    console.warn(
      `[travelpayouts] API returned success=false for ${origin}->${destination} ${getMonthKey(date)}:`,
      json
    );
  }

  // Response shape: { success: true, data: [ { depart_date, value, number_of_changes, ... }, ... ] }
  const rows: any[] = Array.isArray(json?.data) ? json.data : [];
  console.log(`[travelpayouts] ${origin}→${destination} ${getMonthKey(date)}: ${rows.length} rows returned`);

  for (const row of rows) {
    if (!row?.depart_date || row?.value == null) continue;

    // Normalise the date key so it always matches YYYY-MM-DD format
    const departDate = normDate(String(row.depart_date));

    const offer: FlightOffer = {
      price: Number(row.value),
      currency: 'INR',
      carrier: row.airline ?? 'N/A',
      departureTime: departDate,
      arrivalTime: '',
      duration: '',
      stops: typeof row.number_of_changes === 'number' ? row.number_of_changes : 0,
      raw: row,
    };

    const existing = dateMap.get(departDate) ?? [];
    existing.push(offer);
    existing.sort((a, b) => a.price - b.price);
    dateMap.set(departDate, existing);
  }

  console.log(`[travelpayouts] ${origin}→${destination} ${getMonthKey(date)}: dates indexed: ${[...dateMap.keys()].join(', ')}`);

  monthMatrixCache.set(cacheKey, dateMap);
  return dateMap;
}

export async function searchFlights(
  origin: string,
  destination: string,
  date: string // YYYY-MM-DD
): Promise<FlightOffer[]> {
  const dateMap = await fetchMonthMatrix(origin, destination, date);
  const result = dateMap.get(date) ?? [];
  console.log(`[travelpayouts] searchFlights ${origin}→${destination} on ${date}: ${result.length} offers`);
  return result;
}

/**
 * Like searchFlights, but if the exact date has no offer, looks for the
 * nearest available date within ±windowDays, staying within the same month.
 * Returns the cheapest offer found, or [] if nothing available.
 */
export async function searchFlightsNearestDate(
  origin: string,
  destination: string,
  date: string,
  windowDays = 7
): Promise<FlightOffer[]> {
  const dateMap = await fetchMonthMatrix(origin, destination, date);

  // Try exact date first
  const exact = dateMap.get(date);
  if (exact && exact.length > 0) return exact;

  if (dateMap.size === 0) return [];

  // Parse target date
  const target = new Date(`${date}T00:00:00Z`);
  const msPerDay = 86400000;

  // Search within ±windowDays, prefer closest date
  let best: FlightOffer[] | null = null;
  let bestDiff = Infinity;

  for (const [d, offers] of dateMap.entries()) {
    if (!offers || offers.length === 0) continue;
    const candidate = new Date(`${d}T00:00:00Z`);
    const diff = Math.abs(candidate.getTime() - target.getTime()) / msPerDay;
    if (diff <= windowDays && diff < bestDiff) {
      bestDiff = diff;
      best = offers;
    }
  }

  if (best) {
    console.log(`[travelpayouts] nearest-date fallback for ${origin}→${destination} on ${date}: found offer ${bestDiff} days away`);
  } else {
    console.log(`[travelpayouts] no offer within ±${windowDays} days for ${origin}→${destination} on ${date}`);
  }

  return best ?? [];
}