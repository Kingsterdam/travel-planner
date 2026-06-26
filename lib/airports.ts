let airportMap: Record<string, string> | null = null;
let loadingPromise: Promise<Record<string, string>> | null = null;

async function loadAirports(): Promise<Record<string, string>> {
  const res = await fetch('https://api.travelpayouts.com/data/en/airports.json');
  if (!res.ok) {
    console.error('[airports] failed to load airport list', res.status);
    return {};
  }
  const list: any[] = await res.json();
  const map: Record<string, string> = {};
  for (const a of list) {
    if (a?.code) map[a.code] = a.name ?? a.code;
  }
  return map;
}

export async function getAirportName(code: string): Promise<string> {
  if (!airportMap) {
    if (!loadingPromise) loadingPromise = loadAirports();
    airportMap = await loadingPromise;
  }
  return airportMap[code] ?? code;
}

export async function getAirportNames(codes: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const c of codes) {
    out[c] = await getAirportName(c);
  }
  return out;
}