import { DEFAULT_INPUT } from "@/lib/defaults";
import type { DayPlan, FlightOption, ItineraryItem, TripInput } from "@/types";

export function item(id: string, patch: Partial<ItineraryItem> = {}): ItineraryItem {
  return {
    id,
    type: "sightseeing",
    admission: "none",
    name: id,
    description: "",
    stayMinutes: 60,
    travelMinutesToNext: 0,
    entryFee: 0,
    mealCost: 0,
    isEstimated: false,
    ...patch,
  };
}

export function linearDay(day: number, items: ItineraryItem[], patch: Partial<DayPlan> = {}): DayPlan {
  return { day, theme: `DAY ${day}`, kind: "linear", overnightCity: "다낭", amGuided: [], pmFreeOptions: [], items, ...patch };
}

export function input(patch: Partial<TripInput> = {}): TripInput {
  return {
    ...DEFAULT_INPUT,
    destination: "다낭",
    travelers: 4,
    vehicleCostPerDay: 100000,
    guideCostPerDay: 50000,
    targetMarginRate: 20,
    cardFeeRate: 3,
    contingencyRate: 0,
    ...patch,
  };
}

export function flight(patch: Partial<FlightOption> = {}): FlightOption {
  return {
    airline: "비엣젯항공",
    flightNumber: "VJ879",
    departDate: "2026-11-10",
    departAirport: "인천(ICN)",
    departTime: "07:00",
    arriveAirport: "다낭(DAD)",
    arriveTime: "09:40",
    stops: 0,
    duration: "4시간 40분",
    price: 213000,
    basis: "searched",
    sourceName: "",
    link: "",
    returnFlightNumber: "VJ878",
    returnDepartDate: "2026-11-13",
    returnDepartAirport: "다낭(DAD)",
    returnDepartTime: "23:45",
    returnArriveAirport: "인천(ICN)",
    returnArriveTime: "06:00",
    returnStops: 0,
    returnDuration: "4시간 15분",
    ...patch,
  };
}
