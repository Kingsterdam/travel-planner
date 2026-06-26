import { NextRequest, NextResponse } from 'next/server';
import { searchMultiCity } from '@/lib/search-orchestrator';
import type { SearchRequestBody } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SearchRequestBody;
    const { countries, rangeStart, rangeEnd, totalDays, returnHome } = body;

    if (!countries || !Array.isArray(countries) || countries.length < 2) {
      return NextResponse.json(
        { error: 'Provide at least 2 airport codes in "countries" (in travel order).' },
        { status: 400 }
      );
    }
    if (!rangeStart || !rangeEnd) {
      return NextResponse.json(
        { error: 'rangeStart and rangeEnd (YYYY-MM-DD) are required.' },
        { status: 400 }
      );
    }
    if (!totalDays || totalDays < countries.length - 1) {
      return NextResponse.json(
        {
          error: `totalDays must be at least ${countries.length - 1} (1 day per stop).`,
        },
        { status: 400 }
      );
    }

    const normalizedCountries = countries.map((c) => c.trim().toUpperCase());

    const { results, totalItineraries, uniqueLegSearches } = await searchMultiCity(
      normalizedCountries,
      rangeStart,
      rangeEnd,
      Number(totalDays),
      returnHome ?? true,
      10
    );

    return NextResponse.json({ results, totalItineraries, uniqueLegSearches });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err?.message ?? 'Unknown server error' },
      { status: 500 }
    );
  }
}
