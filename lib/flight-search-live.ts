import crypto from 'crypto';
import { getAirportName } from './airports';

const HOST = 'https://api.travelpayouts.com';

export interface SegmentInput {
  origin: string;
  destination: string;
  date: string; // YYYY-MM-DD
}

export interface RealStop {
  code: string;
  name: string;
}

export interface LiveFlightInfo {
  price: number;
  currency: string;
  carrier: string;
  bookingUrl: string;
  agencyName: string;
  // One array of layover stops PER segment (leg) of the itinerary
  stopsPerSegment: RealStop[][];
}

// ── Signature ────────────────────────────────────────────────────────────────

function flattenForSignature(obj: any): string[] {
  if (Array.isArray(obj)) return obj.flatMap(flattenForSignature);
  if (obj && typeof obj === 'object') {
    return Object.keys(obj)
      .sort()
      .flatMap((k) => flattenForSignature(obj[k]));
  }
  return [String(obj)];
}

function getSignature(payload: {
  marker: string;
  host: string;
  user_ip: string;
  locale: string;
  trip_class: string;
  passengers: { adults: number; children: number; infants: number };
  segments: { origin: string; destination: string; date: string }[];
}, token: string): string {
  // Travelpayouts requires values in THIS exact order
  const parts: string[] = [
    token,
    payload.marker,
    payload.host,
    payload.user_ip,
    payload.locale,
    payload.trip_class,
    String(payload.passengers.adults),
    String(payload.passengers.children),
    String(payload.passengers.infants),
    ...payload.segments.flatMap(s => [s.origin, s.destination, s.date]),
  ];

  return crypto.createHash('md5').update(parts.join(':')).digest('hex');
}

// ── Step 1: initiate search ───────────────────────────────────────────────────

async function initiateLiveSearch(
  segments: SegmentInput[],
  marker: string
): Promise<string> {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  if (!token) throw new Error('Missing TRAVELPAYOUTS_TOKEN');

  const host = process.env.NEXT_PUBLIC_SITE_HOST ?? 'localhost';

  const passengers = { adults: 1, children: 0, infants: 0 };
  const mappedSegments = segments.map((s) => ({
    origin: s.origin,
    destination: s.destination,
    date: s.date,
  }));

  const payloadForSig = {
    marker,
    host,
    user_ip: '127.0.0.1',
    locale: 'en',
    trip_class: 'Y',
    passengers,
    segments: mappedSegments,
  };

  const signature = getSignature(payloadForSig, token);

  const body = { ...payloadForSig, signature };

  const res = await fetch(`${HOST}/v1/flight_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 403) {
      throw new Error(
        `flight_search init failed: HTTP 403 — Forbidden. This usually means the "host" value ("${host}") is not registered as a website under your Travelpayouts account. Add it under Dashboard → Websites, then set NEXT_PUBLIC_SITE_HOST to match exactly. Raw response: ${text}`
      );
    }
    throw new Error(`flight_search init failed: HTTP ${res.status} — ${text}`);
  }

  const data = await res.json();
  if (!data.search_id) {
    throw new Error('flight_search init: no search_id returned');
  }
  return data.search_id as string;
}

// ── Step 2: poll results ──────────────────────────────────────────────────────

async function pollLiveResults(searchId: string): Promise<any[]> {
  const res = await fetch(`${HOST}/v1/flight_search_results?uuid=${searchId}`);
  if (!res.ok) throw new Error(`poll failed: HTTP ${res.status}`);
  return res.json();
}

// ── Step 3: poll loop + pick cheapest proposal ────────────────────────────────

export async function fetchLiveItinerary(
  segments: SegmentInput[],
  marker: string,
  maxWaitMs = 15000,
  pollIntervalMs = 1500
): Promise<LiveFlightInfo | null> {
  let searchId: string;
  try {
    searchId = await initiateLiveSearch(segments, marker);
  } catch (e) {
    console.error('[flight-search-live] init failed:', e);
    return null;
  }

  const start = Date.now();
  let bestProposal: any = null;
  let bestGateKey: string | null = null;
  let bestPrice = Infinity;
  let sawFinalChunk = false;

  while (Date.now() - start < maxWaitMs) {
    let chunks: any[];
    try {
      chunks = await pollLiveResults(searchId);
    } catch (e) {
      console.error('[flight-search-live] poll failed:', e);
      break;
    }

    for (const chunk of chunks) {
      // The API sends a final chunk with search_id: null once the search is exhausted
      if (chunk?.search_id === null) sawFinalChunk = true;

      const proposals = chunk?.proposals ?? [];
      for (const p of proposals) {
        const terms = p?.terms;
        if (!terms) continue;
        for (const gateKey of Object.keys(terms)) {
          const price = terms[gateKey]?.unified_price;
          if (typeof price === 'number' && price < bestPrice) {
            bestPrice = price;
            bestProposal = p;
            bestGateKey = gateKey;
          }
        }
      }
    }

    if (sawFinalChunk) break; // finished, with or without offers
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  if (!bestProposal || !bestGateKey) {
    console.log('[flight-search-live] no proposals found for', segments);
    return null;
  }

  const term = bestProposal.terms[bestGateKey];

  // bestProposal.segment is an array (one entry per requested segment/leg).
  // Each segment has .flight[] = the actual flights flown for that leg.
  // Layovers = all flights except the last one in that leg.
  const stopsPerSegmentRaw: string[][] = (bestProposal.segment ?? []).map((seg: any) => {
    const flights = seg?.flight ?? [];
    return flights.slice(0, -1).map((f: any) => f.arrival as string);
  });

  const stopsPerSegment: RealStop[][] = [];
  for (const codes of stopsPerSegmentRaw) {
    const resolved: RealStop[] = [];
    for (const code of codes) {
      resolved.push({ code, name: await getAirportName(code) });
    }
    stopsPerSegment.push(resolved);
  }

  // Real deep link provided directly by Travelpayouts for this exact offer.
  const bookingUrl = term.url?.startsWith('http')
    ? term.url
    : `https://www.aviasales.com${term.url}`;

  return {
    price: term.unified_price,
    currency: term.currency ?? bestProposal.currency ?? 'INR',
    carrier: (bestProposal.carriers ?? [])[0] ?? 'N/A',
    bookingUrl,
    agencyName: term.gate_name ?? bestGateKey,
    stopsPerSegment,
  };
}