// A minimal, low-interactivity map for the hut detail page: one marker, no
// clustering/filtering logic, so detail pages don't pull in the full
// map-client bundle. Shares the worker-URL fix and icon rasterization
// approach with map-client.ts since both are real MapLibre requirements,
// not page-specific choices.
import { Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { RIFUGIO_ICON_URI, BIVACCO_ICON_URI } from './marker-icons.ts';

const LIBERTY_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

setWorkerUrl('/vendor/maplibre-gl/maplibre-gl-worker.mjs');

export interface InitMiniMapOptions {
  containerId: string;
  lat: number;
  lon: number;
  category: 'bivacco' | 'rifugio';
}

export function initMiniMap(options: InitMiniMapOptions): void {
  const { containerId, lat, lon, category } = options;
  const map = new MapLibreMap({
    container: containerId,
    style: LIBERTY_STYLE_URL,
    center: [lon, lat],
    zoom: 12,
    interactive: false,
    attributionControl: { compact: true },
  });

  const el = document.createElement('div');
  el.className = `mini-map-marker mini-map-marker--${category}`;
  el.style.backgroundImage = `url(${category === 'bivacco' ? BIVACCO_ICON_URI : RIFUGIO_ICON_URI})`;
  new Marker({ element: el, anchor: 'bottom' }).setLngLat([lon, lat]).addTo(map);
}
