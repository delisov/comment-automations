export const hoursToMs = (hours: number): number => hours * 60 * 60 * 1000;

export const daysToMs = (days: number): number => hoursToMs(days * 24);
