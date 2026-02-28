export interface ZoneConfig {
  low: number;
  high: number;
  holdDuration: number; // seconds needed inside zone
  timeLimit: number; // total seconds allowed
}

export const ZONE_PROGRESSION: ZoneConfig[] = [
  { low: 25, high: 75, holdDuration: 1.5, timeLimit: 10 }, // Round 1: wide, easy
  { low: 30, high: 65, holdDuration: 2.0, timeLimit: 9 }, // Round 2: narrower
  { low: 45, high: 70, holdDuration: 2.0, timeLimit: 8 }, // Round 3: shifted up
  { low: 15, high: 35, holdDuration: 2.5, timeLimit: 8 }, // Round 4: quiet zone
  { low: 55, high: 75, holdDuration: 2.5, timeLimit: 7 }, // Round 5: loud + narrow
  { low: 35, high: 50, holdDuration: 3.0, timeLimit: 7 }, // Round 6: very narrow
  { low: 60, high: 72, holdDuration: 3.0, timeLimit: 6 }, // Round 7: narrow + loud
  { low: 40, high: 52, holdDuration: 3.5, timeLimit: 6 }, // Round 8: final form
];

export function getZoneForRound(round: number): ZoneConfig {
  const idx = Math.min(round - 1, ZONE_PROGRESSION.length - 1);
  return ZONE_PROGRESSION[idx];
}

export function getMaxRounds(): number {
  return ZONE_PROGRESSION.length;
}

export function isInsideZone(volume: number, zone: ZoneConfig): boolean {
  return volume >= zone.low && volume <= zone.high;
}
