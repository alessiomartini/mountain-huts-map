// Two genuinely different silhouettes (house vs. tent), not just two colors —
// spec requires markers to be distinguishable without relying on color
// perception. Both are pin-shaped (round body, pointed tail) so the tail tip
// marks the exact coordinate when anchored 'bottom'.
function pinSvg(innerIcon: string, color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
    <path d="M16 40 L6 24 A10 10 0 1 1 26 24 Z" fill="${color}" stroke="#ffffff" stroke-width="2"/>
    ${innerIcon}
  </svg>`;
}

const RIFUGIO_ICON = `<polygon points="16,4 9,11 23,11" fill="#ffffff"/><rect x="11" y="10" width="10" height="8" fill="#ffffff"/>`;
const BIVACCO_ICON = `<polygon points="16,9 8,20 24,20" fill="#ffffff"/>`;

function toDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

// Brighter/more saturated than a first pass at #2f5d3a / #b3541e — those
// read as muted, dark tones that wash out against green forest or brown
// terrain on the topo map style. Same hues (green = rifugio, orange =
// bivacco), just enough saturation/brightness to stay visible on both map styles.
export const RIFUGIO_ICON_URI = toDataUri(pinSvg(RIFUGIO_ICON, '#1FA34D'));
export const BIVACCO_ICON_URI = toDataUri(pinSvg(BIVACCO_ICON, '#F26522'));
