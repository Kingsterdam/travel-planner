'use client'

import { useState } from 'react';
import type { RankedItinerary, RankedItineraryLeg, RealStop } from '@/lib/types';

// ── Fallback booking URL helpers (used ONLY when live confirmation has no result) ──

function buildLegBookingUrlFallback(origin: string, destination: string, date: string): string {
  return `https://www.kiwi.com/en/search/results/${origin}/${destination}/${date}/no-return`;
}

function buildItineraryBookingUrlFallback(legs: RankedItineraryLeg[]): string {
  if (legs.length === 0) return '#';
  if (legs.length === 1) {
    return buildLegBookingUrlFallback(legs[0].origin, legs[0].destination, legs[0].date);
  }
  const params = new URLSearchParams();
  legs.forEach((leg, i) => {
    params.set(`segments[${i}][from]`, leg.origin);
    params.set(`segments[${i}][to]`, leg.destination);
    params.set(`segments[${i}][date]`, leg.date);
  });
  return `https://www.kiwi.com/en/search/results/multicity?${params.toString()}`;
}

// ── Stop timeline component ──────────────────────────────────────────────────

/**
 * Shows the real layover airports when available (from the live API).
 * Falls back to a generic "N stops" badge if live confirmation hasn't run
 * yet or found nothing for this leg.
 */
function StopsBadge({ stops, realStops }: { stops: number; realStops?: RealStop[] }) {
  if (stops === 0) {
    return (
      <span className="leg-stops-badge leg-stops-badge-direct">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
        Direct
      </span>
    );
  }

  const haveRealNames = realStops && realStops.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="leg-stops-badge leg-stops-badge-connecting">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
        {stops} stop{stops > 1 ? 's' : ''}
        {haveRealNames && (
          <> via {realStops!.map((s) => s.name || s.code).join(', ')}</>
        )}
      </span>

      <div className="stops-timeline" aria-label={`${stops} layover${stops > 1 ? 's' : ''}`}>
        <div className="stops-airport">
          <div className="stops-dot" />
          <span className="stops-label">Dep.</span>
        </div>
        {Array.from({ length: stops }).map((_, i) => {
          const real = haveRealNames ? realStops![i] : undefined;
          return (
            <div key={`seg-${i}`} style={{ display: 'flex', alignItems: 'center' }}>
              <div className="stops-line" style={{ minWidth: stops > 1 ? 28 : 40 }} />
              <div className="stops-airport">
                <div className="stops-dot stops-dot-layover" />
                <span className="stops-label">{real ? real.code : `Stop ${stops > 1 ? i + 1 : ''}`}</span>
              </div>
            </div>
          );
        })}
        <div className="stops-line" style={{ minWidth: stops > 1 ? 28 : 40 }} />
        <div className="stops-airport">
          <div className="stops-dot" />
          <span className="stops-label">Arr.</span>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [countries, setCountries] = useState('DEL,GYD,TBS,EVN');
  const [rangeStart, setRangeStart] = useState('2026-10-01');
  const [rangeEnd, setRangeEnd] = useState('2026-10-31');
  const [totalDays, setTotalDays] = useState(10);
  const [returnHome, setReturnHome] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<RankedItinerary[]>([]);
  const [searched, setSearched] = useState(false);
  const [meta, setMeta] = useState<{
    totalItineraries: number;
    uniqueLegSearches: number;
  } | null>(null);

  async function handleSearch() {
    setLoading(true);
    setError(null);
    setResults([]);
    setMeta(null);
    setSearched(false);

    try {
      const res = await fetch('/api/search-multicity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countries: countries.split(',').map((c) => c.trim()).filter(Boolean),
          rangeStart,
          rangeEnd,
          totalDays: Number(totalDays),
          returnHome,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.');
        return;
      }

      setResults(data.results ?? []);
      setMeta({
        totalItineraries: data.totalItineraries ?? 0,
        uniqueLegSearches: data.uniqueLegSearches ?? 0,
      });
      setSearched(true);
    } catch (err: any) {
      setError(err?.message ?? 'Network error');
    } finally {
      setLoading(false);
    }
  }

  const airports = countries.split(',').map((c) => c.trim()).filter(Boolean);

  const routePreview = airports.length >= 2
    ? airports.join(' → ') + (returnHome ? ` → ${airports[0]}` : '')
    : null;

  return (
    <div className="page-root">
      <header className="hero">
        <div className="hero-inner">
          <div className="hero-label">Flight planner</div>
          <h1 className="hero-title">Multi-city trip finder</h1>
          <p className="hero-sub">Compare every combination of dates and stays to surface the cheapest route.</p>
        </div>
      </header>

      <main className="main-content">
        <section className="search-card">
          <div className="field-group">
            <label className="field-label">Route — airport codes in order</label>
            <input
              className="text-input"
              type="text"
              value={countries}
              onChange={(e) => setCountries(e.target.value)}
              placeholder="DEL, GYD, TBS, EVN"
              spellCheck={false}
            />
            {routePreview && (
              <div className="route-preview">
                {airports.map((code, i) => (
                  <span key={i} className="route-preview-inner">
                    <span className="route-chip">{code}</span>
                    {i < airports.length - 1 && <span className="route-arrow">→</span>}
                  </span>
                ))}
                {returnHome && (
                  <>
                    <span className="route-arrow">→</span>
                    <span className="route-chip route-chip-return">{airports[0]}</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="form-row">
            <div className="field-group">
              <label className="field-label">Earliest departure</label>
              <input
                className="text-input"
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
              />
            </div>
            <div className="field-group">
              <label className="field-label">Latest return</label>
              <input
                className="text-input"
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
              />
            </div>
            <div className="field-group">
              <label className="field-label">Trip length (days)</label>
              <input
                className="text-input"
                type="number"
                min={airports.length > 1 ? airports.length - 1 : 1}
                value={totalDays}
                onChange={(e) => setTotalDays(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="form-footer">
            <label className="checkbox-label">
              <input
                type="checkbox"
                className="checkbox"
                checked={returnHome}
                onChange={(e) => setReturnHome(e.target.checked)}
              />
              <span>Include return flight home</span>
            </label>
            <button className="search-btn" onClick={handleSearch} disabled={loading}>
              {loading ? (
                <span className="btn-inner">
                  <span className="spinner" />
                  Searching…
                </span>
              ) : (
                <span className="btn-inner">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  Find best itineraries
                </span>
              )}
            </button>
          </div>

          {error && (
            <div className="error-banner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}
        </section>

        {meta && (
          <div className="meta-row">
            <span className="meta-stat">
              <strong>{meta.totalItineraries.toLocaleString()}</strong> combinations checked
            </span>
            <span className="meta-dot" />
            <span className="meta-stat">
              <strong>{meta.uniqueLegSearches}</strong> flight searches
            </span>
            {results.length > 0 && (
              <>
                <span className="meta-dot" />
                <span className="meta-stat meta-found">
                  <strong>{results.length}</strong> priced itineraries found
                </span>
              </>
            )}
          </div>
        )}

        {searched && results.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <h2 className="empty-title">No complete itineraries found</h2>
            <p className="empty-body">
              Pricing data exists but no single itinerary had fares on every leg. Try widening your date range, increasing trip days, or checking that all airport codes are valid.
            </p>
          </div>
        )}

        {results.length > 0 && (
          <section className="results-section">
            <h2 className="results-heading">
              Top {results.length} itinerar{results.length === 1 ? 'y' : 'ies'}
            </h2>
            <div className="results-grid">
              {results.map((r, i) => (
                <ItineraryCard key={i} r={r} rank={i} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

// ── Itinerary card ────────────────────────────────────────────────────────────

function ItineraryCard({ r, rank }: { r: RankedItinerary; rank: number }) {
  const [open, setOpen] = useState(rank === 0);
  const isBest = rank === 0;

  // Prefer the REAL booking link from the live API. Only fall back to a
  // generic multi-city search link if live confirmation didn't return one
  // (e.g. TRAVELPAYOUTS_MARKER missing, or no live offer found for this route).
  const bookAllUrl = r.liveBookingUrl ?? buildItineraryBookingUrlFallback(r.legs);
  const isLiveLink = Boolean(r.liveBookingUrl);

  return (
    <div className={`itin-card ${isBest ? 'itin-card-best' : ''}`}>
      {isBest && <div className="best-badge">✦ Best price</div>}

      <button className="itin-header" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <div className="itin-header-left">
          <div className="itin-price">
            <span className="itin-currency">{r.currency}</span>
            <span className="itin-amount">{r.totalPrice.toLocaleString()}</span>
          </div>
          <div className="itin-meta">
            <span>Departs {r.startDate}</span>
            <span className="itin-meta-sep">·</span>
            <span>{r.stayDistribution.join(' / ')} days per stop</span>
          </div>
        </div>
        <div className={`itin-chevron ${open ? 'itin-chevron-open' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </button>

      {open && (
        <>
          <div className="itin-legs">
            {r.legs.map((leg, j) => (
              <LegRow key={j} leg={leg} />
            ))}
          </div>

          <div className="itin-footer">
            <span className="itin-footer-note">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {isLiveLink
                ? `Live offer from ${r.liveAgencyName ?? 'partner agency'}. Confirm final price on their site.`
                : 'Prices are indicative. Confirm on booking site.'}
            </span>
            <a
              href={bookAllUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="book-all-btn"
              onClick={(e) => e.stopPropagation()}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Book this itinerary
            </a>
          </div>
        </>
      )}
    </div>
  );
}

// ── Individual leg row ────────────────────────────────────────────────────────

function LegRow({ leg }: { leg: RankedItineraryLeg }) {
  const bookUrl = buildLegBookingUrlFallback(leg.origin, leg.destination, leg.date);

  return (
    <div className="leg-row">
      <div className="leg-left">
        <div className="leg-route">
          <span className="leg-code">{leg.origin}</span>
          <span className="leg-line">
            <svg width="20" height="12" viewBox="0 0 20 12" fill="none" aria-hidden="true">
              <path d="M1 6h16M13 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
          <span className="leg-code">{leg.destination}</span>
          <span className="leg-date">{leg.date}</span>
        </div>

        {leg.offer && (
          <StopsBadge stops={leg.realStops ? leg.realStops.length : leg.offer.stops} realStops={leg.realStops} />
        )}
      </div>

      <div className="leg-right">
        {leg.offer ? (
          <>
            <div className="leg-price-wrap">
              <span className="leg-price">{leg.offer.currency} {leg.offer.price.toLocaleString()}</span>
              {leg.offer.carrier !== 'N/A' && (
                <span className="leg-carrier">{leg.offer.carrier}</span>
              )}
            </div>
            <a
              href={bookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="book-btn"
              onClick={(e) => e.stopPropagation()}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Book
            </a>
          </>
        ) : (
          <span className="leg-no-offer">No fare found</span>
        )}
      </div>
    </div>
  );
}