import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET() {
  const token = process.env.TRAVELPAYOUTS_TOKEN;
  const marker = process.env.TRAVELPAYOUTS_MARKER;
  const host = process.env.NEXT_PUBLIC_SITE_HOST ?? 'localhost';

  if (!token || !marker) {
    return NextResponse.json({ error: 'Missing env vars', token: !!token, marker: !!marker });
  }

  const passengers = { adults: 1, children: 0, infants: 0 };
  const segments = [{ origin: 'DEL', destination: 'GYD', date: '2026-08-01' }];

  const sigParts = [
    token, marker, host, '127.0.0.1', 'en', 'Y',
    String(passengers.adults), String(passengers.children), String(passengers.infants),
    ...segments.flatMap(s => [s.origin, s.destination, s.date]),
  ];

  const sigString = sigParts.join(':');
  const signature = crypto.createHash('md5').update(sigString).digest('hex');

  const payload = {
    marker, host, user_ip: '127.0.0.1', locale: 'en',
    trip_class: 'Y', passengers, segments, signature,
  };

  let rawResponse = '';
  let status = 0;
  try {
    const res = await fetch('https://api.travelpayouts.com/v1/flight_search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    status = res.status;
    rawResponse = await res.text();
  } catch (e: any) {
    rawResponse = e.message;
  }

  return NextResponse.json({
    envVars: { token: token.slice(0, 6) + '...', marker, host },
    signatureString: sigString,
    signature,
    payload,
    travelpayoutsStatus: status,
    travelpayoutsRawResponse: rawResponse,
  });
}