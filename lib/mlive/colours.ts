export const MLIVE_COLOURS = {
  ink: "#14161C",
  raised: "#2A2D36",
  page: "#F6F4EF",
  card: "#FFFFFF",
  border: "#E4DFD3",
  text: "#14161C",
  muted: "#55524B",
  onInk: "#FFFFFF",
  swing: {
    book: "#6B4FB3",
    tint: "#EEE9F8",
    text: "#49367D",
    onDark: "#B9A8F0",
  },
  nifty: {
    book: "#2F6FB5",
    tint: "#E3EDF8",
    text: "#1E4F86",
    onDark: "#5B9BE0",
  },
  longGame: {
    book: "#F2A20C",
    tint: "#FCEBC8",
    text: "#6B3F00",
  },
  profit: { book: "#2F7D4F", tint: "#E3F1E8", text: "#1F5E3A" },
  loss: { book: "#B3261E", tint: "#F6E3DC", text: "#8A2E12" },
} as const;

export type ContrastPair = { name: string; text: string; background: string };

/** Book colour is not used on navigation. Active navigation is white text on raised ink. */
/** Text and background pairs the Mansel Live UI actually paints. */
export const MLIVE_CONTRAST_PAIRS: ContrastPair[] = [
  { name: "text on page", text: MLIVE_COLOURS.text, background: MLIVE_COLOURS.page },
  { name: "text on card", text: MLIVE_COLOURS.text, background: MLIVE_COLOURS.card },
  { name: "muted on page", text: MLIVE_COLOURS.muted, background: MLIVE_COLOURS.page },
  { name: "muted on card", text: MLIVE_COLOURS.muted, background: MLIVE_COLOURS.card },
  { name: "white on ink button", text: MLIVE_COLOURS.onInk, background: MLIVE_COLOURS.ink },
  { name: "white on raised nav", text: MLIVE_COLOURS.onInk, background: MLIVE_COLOURS.raised },
  { name: "ink on saffron mark", text: MLIVE_COLOURS.ink, background: MLIVE_COLOURS.longGame.book },
  { name: "swing book on card", text: MLIVE_COLOURS.swing.book, background: MLIVE_COLOURS.card },
  { name: "swing text on tint", text: MLIVE_COLOURS.swing.text, background: MLIVE_COLOURS.swing.tint },
  { name: "swing on dark", text: MLIVE_COLOURS.swing.onDark, background: MLIVE_COLOURS.ink },
  { name: "nifty book on card", text: MLIVE_COLOURS.nifty.book, background: MLIVE_COLOURS.card },
  { name: "nifty text on tint", text: MLIVE_COLOURS.nifty.text, background: MLIVE_COLOURS.nifty.tint },
  { name: "nifty on dark", text: MLIVE_COLOURS.nifty.onDark, background: MLIVE_COLOURS.ink },
  { name: "long game text on tint", text: MLIVE_COLOURS.longGame.text, background: MLIVE_COLOURS.longGame.tint },
  { name: "profit tint on ink", text: MLIVE_COLOURS.profit.tint, background: MLIVE_COLOURS.ink },
  { name: "loss tint on ink", text: MLIVE_COLOURS.loss.tint, background: MLIVE_COLOURS.ink },
  { name: "profit text on tint", text: MLIVE_COLOURS.profit.text, background: MLIVE_COLOURS.profit.tint },
  { name: "profit on page", text: MLIVE_COLOURS.profit.book, background: MLIVE_COLOURS.page },
  { name: "loss text on tint", text: MLIVE_COLOURS.loss.text, background: MLIVE_COLOURS.loss.tint },
  { name: "loss on page", text: MLIVE_COLOURS.loss.book, background: MLIVE_COLOURS.page },
  { name: "open on open tint", text: "#55524B", background: "#EEEAE2" },
];

function channel(hex: string, index: number): number {
  const value = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(text: string, background: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [0, 1, 2].map((index) => channel(hex, index));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const left = luminance(text);
  const right = luminance(background);
  const [hi, lo] = left > right ? [left, right] : [right, left];
  return (hi + 0.05) / (lo + 0.05);
}
