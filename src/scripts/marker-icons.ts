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

// Green/orange (and before that, a darker green/rust) both sit inside
// OpenTopoMap's own color range — its forest green and open-terrain tan are
// close enough to those hues that pins nearly vanish into the basemap.
// Blue/red aren't used as area fills on either map style (Liberty or
// OpenTopoMap), so they stay legible against forest, bare terrain, snow, or
// water alike. Keep in sync with --color-rifugio/--color-bivacco in
// global.css, which color the same categories elsewhere on the site (hut
// badges, filter chips).
export const RIFUGIO_ICON_URI = toDataUri(pinSvg(RIFUGIO_ICON, '#1565C0'));
export const BIVACCO_ICON_URI = toDataUri(pinSvg(BIVACCO_ICON, '#D6293E'));
