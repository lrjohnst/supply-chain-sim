export const euros = (n: number) =>
  "€" + Math.round(n).toLocaleString("en-GB");

export const eurosDecimals = (n: number) =>
  "€" + n.toFixed(2);

export const pct = (n: number) => (n * 100).toFixed(1) + "%";

export const qty = (n: number) => Math.round(n).toLocaleString("en-GB");

export const turnLabel = (turn: number): string => {
  const year = 1980 + Math.floor(turn / 4);
  const q = (turn % 4) + 1;
  return `${year} Q${q}`;
};
