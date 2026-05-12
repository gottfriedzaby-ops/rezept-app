interface TagColor {
  bg: string;
  text: string;
  gradient: [string, string];
}

const TAG_MAP: Array<[string, TagColor]> = [
  ["vegetarisch", { bg: "#E8EEE9", text: "#2D5F3F", gradient: ["#E8EEE9", "#D0E0D4"] }],
  ["vegan",       { bg: "#D8EAD8", text: "#1F4A2E", gradient: ["#D8EAD8", "#C4D4C4"] }],
  ["dessert",     { bg: "#F0E4E4", text: "#6B3333", gradient: ["#F0E4E4", "#E4D0D0"] }],
  ["kuchen",      { bg: "#F0E4E4", text: "#6B3333", gradient: ["#F0E4E4", "#E4D0D0"] }],
  ["gebäck",      { bg: "#EEE4D8", text: "#6B4A2A", gradient: ["#EEE4D8", "#E4D4C4"] }],
  ["brot",        { bg: "#EDE8DC", text: "#5C4A2A", gradient: ["#EDE8DC", "#E0D4C0"] }],
  ["schnell",     { bg: "#F0EACC", text: "#5C4A1A", gradient: ["#F0EACC", "#E4DEB8"] }],
  ["pasta",       { bg: "#F0E8DC", text: "#6B4A2A", gradient: ["#F0E8DC", "#E4D8C4"] }],
  ["suppe",       { bg: "#DCE8F0", text: "#1A3A4A", gradient: ["#DCE8F0", "#C8D8E8"] }],
  ["eintopf",     { bg: "#DCE8F0", text: "#1A3A4A", gradient: ["#DCE8F0", "#C8D8E8"] }],
  ["salat",       { bg: "#E0EEE0", text: "#1A4A1A", gradient: ["#E0EEE0", "#CCD8CC"] }],
  ["fleisch",     { bg: "#EDE0DC", text: "#5C2A2A", gradient: ["#EDE0DC", "#E0CCCC"] }],
  ["geflügel",    { bg: "#EDE8DC", text: "#4A3A1A", gradient: ["#EDE8DC", "#E0D4C0"] }],
  ["fisch",       { bg: "#DCE8EE", text: "#1A3A4A", gradient: ["#DCE8EE", "#C8D8E4"] }],
  ["meeresfrüchte", { bg: "#DCE8EE", text: "#1A3A4A", gradient: ["#DCE8EE", "#C8D8E4"] }],
  ["frühstück",   { bg: "#F0ECD4", text: "#5C4A1A", gradient: ["#F0ECD4", "#E4DCC0"] }],
  ["mittagessen", { bg: "#E8F0E8", text: "#2A4A2A", gradient: ["#E8F0E8", "#D4E4D4"] }],
  ["abendessen",  { bg: "#E8E0F0", text: "#3A2A5C", gradient: ["#E8E0F0", "#D4CCC8"] }],
  ["snack",       { bg: "#F0ECD4", text: "#5C4A1A", gradient: ["#F0ECD4", "#E4DCC0"] }],
  ["glutenfrei",  { bg: "#E8F0E0", text: "#2A4A1A", gradient: ["#E8F0E0", "#D4E0CC"] }],
  ["laktosefrei", { bg: "#E0ECF0", text: "#1A3A4A", gradient: ["#E0ECF0", "#CCDCE4"] }],
  ["einfach",     { bg: "#E8EEE9", text: "#2D5F3F", gradient: ["#E8EEE9", "#D4E4D8"] }],
  ["aufwändig",   { bg: "#EDE0DC", text: "#5C2A2A", gradient: ["#EDE0DC", "#E0CCCC"] }],
  ["grundrezept", { bg: "#F0ECD4", text: "#4A3A1A", gradient: ["#F0ECD4", "#E4DCC0"] }],
];

const DEFAULT_COLOR: TagColor = {
  bg: "#F3F1EC",
  text: "#6B6B66",
  gradient: ["#F3F1EC", "#E8E4DC"],
};

function match(tag: string): TagColor {
  const lower = tag.toLowerCase();
  for (const [key, color] of TAG_MAP) {
    if (lower.includes(key)) return color;
  }
  return DEFAULT_COLOR;
}

export function getTagColor(tag: string): { bg: string; text: string } {
  const { bg, text } = match(tag);
  return { bg, text };
}

export function getTagKeys(): string[] {
  return TAG_MAP.map(([key]) => key);
}

export function getRecipeGradient(tags: string[]): [string, string] {
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    for (const [key, color] of TAG_MAP) {
      if (lower.includes(key)) return color.gradient;
    }
  }
  return DEFAULT_COLOR.gradient;
}
