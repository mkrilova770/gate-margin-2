export function toFundingAPR(rawFundingRate: number | null, intervalHours: number): number | null {
  if (rawFundingRate == null || !Number.isFinite(rawFundingRate) || intervalHours <= 0) {
    return null;
  }
  const periodsPerYear = (24 / intervalHours) * 365;
  return rawFundingRate * periodsPerYear * 100;
}

export function toSpreadPercent(futuresPrice: number | null, spotPrice: number | null): number | null {
  if (
    futuresPrice == null ||
    spotPrice == null ||
    !Number.isFinite(futuresPrice) ||
    !Number.isFinite(spotPrice) ||
    spotPrice <= 0
  ) {
    return null;
  }
  return ((futuresPrice - spotPrice) / spotPrice) * 100;
}
