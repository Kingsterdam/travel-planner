export interface FlightOffer {
  price: number;
  currency: string;
  carrier: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  stops: number;
  raw: any;
}

export interface LegPlan {
  origin: string;
  destination: string;
  date: string; // YYYY-MM-DD
}

export interface ItineraryPlan {
  startDate: string;
  stayDistribution: number[];
  legs: LegPlan[];
}

export interface RealStop {
  code: string;
  name: string;
}

export interface RankedItineraryLeg extends LegPlan {
  offer: FlightOffer | null;
  // Real layover airports for this specific leg, filled in only after the
  // live-search confirmation pass. Empty array = direct (or not yet confirmed).
  realStops?: RealStop[];
}

export interface RankedItinerary {
  startDate: string;
  stayDistribution: number[];
  totalPrice: number;
  currency: string;
  legs: RankedItineraryLeg[];
  // Filled in by the live-search confirmation pass run on the top-N results only.
  liveBookingUrl?: string | null;
  liveAgencyName?: string | null;
  liveConfirmed?: boolean; // true once we've attempted live confirmation (even if it failed)
}

export interface SearchRequestBody {
  countries: string[];
  rangeStart: string;
  rangeEnd: string;
  totalDays: number;
  returnHome?: boolean;
}