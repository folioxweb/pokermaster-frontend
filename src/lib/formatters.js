/**
 * Points Formatter for PokerMaster
 * Formats all numeric amounts as Points (PTS). Absolutely no dollar sign anywhere.
 */

export function formatPoints(amount = 0) {
  const num = Number(amount) || 0;
  return `${num.toLocaleString()} PTS`;
}

export function formatPointsOnly(amount = 0) {
  const num = Number(amount) || 0;
  return `${num.toLocaleString()} PTS`;
}

export function formatCurrencyOnly(amount = 0) {
  const num = Number(amount) || 0;
  return `${num.toLocaleString()} PTS`;
}

export function formatPointsCompact(amount = 0) {
  const num = Number(amount) || 0;
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M PTS`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K PTS`;
  }
  return `${num} PTS`;
}
