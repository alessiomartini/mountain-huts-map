// maplibre-gl has no default export (only named ones) as of v6 — Map is
// aliased to avoid colliding with the global Map constructor.
import { Map as MapLibreMap, NavigationControl, GeolocateControl, Marker, Popup, GeoJSONSource, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// Vite can't see maplibre-gl's own worker (it's a pre-built file loaded via a
// runtime-constructed URL, not something the bundler parses), so it's never
// emitted as a build asset and `new Worker(...)` 404s unless pointed at it
// explicitly. The worker also does a plain relative import of its
// maplibre-gl-shared.mjs sibling at runtime, which only resolves correctly
// if both files are served unhashed, side by side — see
// scripts/copy-maplibre-worker.mjs, which vendors them into public/ on
// `npm install`.
setWorkerUrl('/vendor/maplibre-gl/maplibre-gl-worker.mjs');
// Not re-exported by maplibre-gl itself, but it's the real type setStyle()
// expects — pulled from its own style-spec dependency rather than hand-rolled.
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { RIFUGIO_ICON_URI, BIVACCO_ICON_URI } from './marker-icons.ts';
import type { HutFeatureCollection, HutFeatureProperties } from '../lib/geojson.ts';

const LIBERTY_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

// Screen-pixel radius MapLibre uses to decide whether two points merge into
// one cluster. Lower = markers stay separate even when close together /
// overlapping; higher = they merge sooner. Tune this single number to
// change when clustering kicks in — it's independent of marker icon size.
const CLUSTER_RADIUS_PX = 8;

// OpenTopoMap's public tile server is meant for moderate load (its published
// policy asks for roughly 2 req/s per site) with mandatory attribution.
// That's fine for this map, but self-host or use a paid provider before
// high-traffic production use — see /attribution for the full note.
function topoStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      opentopomap: {
        type: 'raster',
        tiles: [
          'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
          'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
          'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        maxzoom: 17,
        attribution: '&copy; OpenTopoMap (CC-BY-SA)',
      },
    },
    layers: [{ id: 'opentopomap', type: 'raster', source: 'opentopomap' }],
  };
}

interface FilterState {
  types: Set<string>;
  altMin: number;
  altMax: number;
  freeOnly: boolean;
  facilities: Set<string>;
  country: string;
  region: string;
  search: string;
}

function readStateFromUrl(defaults: { altMin: number; altMax: number }): FilterState {
  const params = new URLSearchParams(location.search);
  const typeParam = params.get('type');
  return {
    // Default to bivacchi only on first visit (no `type` in the URL yet);
    // rifugi is an opt-in the visitor turns on themselves.
    types: new Set(typeParam ? typeParam.split(',') : ['bivacco']),
    altMin: params.has('alt_min') ? Number(params.get('alt_min')) : defaults.altMin,
    altMax: params.has('alt_max') ? Number(params.get('alt_max')) : defaults.altMax,
    freeOnly: params.get('free') === '1',
    facilities: new Set(params.get('fac')?.split(',').filter(Boolean) ?? []),
    country: params.get('country') ?? '',
    region: params.get('region') ?? '',
    search: params.get('q') ?? '',
  };
}

function writeStateToUrl(state: FilterState): void {
  const params = new URLSearchParams();
  if (state.types.size > 0 && state.types.size < 2) params.set('type', [...state.types].join(','));
  if (state.altMin) params.set('alt_min', String(state.altMin));
  if (state.altMax) params.set('alt_max', String(state.altMax));
  if (state.freeOnly) params.set('free', '1');
  if (state.facilities.size > 0) params.set('fac', [...state.facilities].join(','));
  if (state.country) params.set('country', state.country);
  if (state.region) params.set('region', state.region);
  if (state.search) params.set('q', state.search);
  const qs = params.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function matches(props: HutFeatureProperties, state: FilterState): boolean {
  if (!state.types.has(props.category)) return false;
  if (props.elevation_m != null) {
    if (props.elevation_m < state.altMin || props.elevation_m > state.altMax) return false;
  }
  if (state.freeOnly && !props.free) return false;
  for (const fac of state.facilities) {
    if (!(props as unknown as Record<string, boolean>)[fac]) return false;
  }
  if (state.country && props.country !== state.country) return false;
  if (state.region && props.region !== state.region) return false;
  if (state.search && !normalize(props.name).includes(normalize(state.search))) return false;
  return true;
}

function filterCollection(all: HutFeatureCollection, state: FilterState): HutFeatureCollection {
  return { type: 'FeatureCollection', features: all.features.filter((f) => matches(f.properties, state)) };
}

export interface InitMapOptions {
  containerId: string;
  allFeatures: HutFeatureCollection;
  hutHref: (slug: string) => string;
  resultsCountTemplate: string; // "{count} risultati" — {count} substituted client-side
  nearMeErrorMessage: string;
}

// A `define:vars` <script> can't contain module imports (Astro treats it as
// is:inline once it has that attribute), so the map page uses it only to
// stash the server-rendered data on `window`, then a separate `<script
// type="module">` reads it back here and calls the real init function.
declare global {
  interface Window {
    __HUTS_MAP_INIT__?: {
      featureCollection: HutFeatureCollection;
      lang: 'it' | 'en';
      resultsCountTemplate: string;
      nearMeErrorMessage: string;
    };
  }
}

export function initHutsMapFromGlobal(): void {
  const init = window.__HUTS_MAP_INIT__;
  if (!init) return;
  initHutsMap({
    containerId: 'map-container',
    allFeatures: init.featureCollection,
    hutHref: (slug) => `/${init.lang}/hut/${slug}`,
    resultsCountTemplate: init.resultsCountTemplate,
    nearMeErrorMessage: init.nearMeErrorMessage,
  });
}

// MapLibre's own map.loadImage() can fail to decode SVG data URIs in some
// browsers (it relies on createImageBitmap, whose SVG support is
// inconsistent) — rasterizing through a plain <img>+<canvas> first is more
// reliable and gives addImage() the ImageData it wants either way.
function rasterizeSvgIcon(svgDataUri: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('2D canvas context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = () => reject(new Error(`Failed to load marker icon: ${svgDataUri.slice(0, 40)}...`));
    img.src = svgDataUri;
  });
}

export function initHutsMap(options: InitMapOptions): void {
  const { containerId, allFeatures, hutHref, resultsCountTemplate, nearMeErrorMessage } = options;

  const elevations = allFeatures.features.map((f) => f.properties.elevation_m).filter((e): e is number => e != null);
  const defaultAltMin = elevations.length ? Math.min(...elevations) : 0;
  const defaultAltMax = elevations.length ? Math.max(...elevations) : 4000;

  // A hut detail page's "open on the full map" link passes focus_lat/focus_lon
  // so the map opens centered on that hut instead of the default overview.
  const focusParams = new URLSearchParams(location.search);
  const focusLat = Number(focusParams.get('focus_lat'));
  const focusLon = Number(focusParams.get('focus_lon'));
  const hasFocusPoint = Number.isFinite(focusLat) && Number.isFinite(focusLon) && focusParams.has('focus_lat');

  const map = new MapLibreMap({
    container: containerId,
    style: LIBERTY_STYLE_URL,
    center: hasFocusPoint ? [focusLon, focusLat] : [10, 46],
    zoom: hasFocusPoint ? 13 : 5,
    attributionControl: { compact: true },
  });
  map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new GeolocateControl({ positionOptions: { enableHighAccuracy: true } }), 'top-right');

  let hutsInteractionsBound = false;

  // Re-creates the huts source/layers from scratch every time it's called —
  // safe to call again after a style switch. map.setStyle() diffs the whole
  // style against the new one and drops anything (sources, layers) that
  // isn't part of it, so 'huts' and its 3 layers don't survive switching to
  // the topo style; explicitly removing stale bits first (rather than
  // early-returning if 'huts' happens to still be there mid-transition)
  // means this never silently no-ops. Click/hover handlers are bound once
  // only (guarded below) since MapLibre dispatches layer-scoped events by
  // layer *id*, so handlers registered once keep matching a layer recreated
  // under the same id — re-binding on every switch would just stack
  // duplicate handlers.
  function addHutsLayers(data: HutFeatureCollection): void {
    if (map.getLayer('unclustered')) map.removeLayer('unclustered');
    if (map.getLayer('cluster-count')) map.removeLayer('cluster-count');
    if (map.getLayer('clusters')) map.removeLayer('clusters');
    if (map.getSource('huts')) map.removeSource('huts');

    const ICON_SIZE = 0.5;

    map.addSource('huts', {
      type: 'geojson',
      data,
      cluster: true,
      clusterRadius: CLUSTER_RADIUS_PX,
      clusterMaxZoom: 14,
    });

    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'huts',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#3a6ea5',
        'circle-radius': ['step', ['get', 'point_count'], 16, 25, 20, 100, 26],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });
    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'huts',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 13,
      },
      paint: { 'text-color': '#ffffff' },
    });
    map.addLayer({
      id: 'unclustered',
      type: 'symbol',
      source: 'huts',
      filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': ['case', ['==', ['get', 'category'], 'bivacco'], 'bivacco-icon', 'rifugio-icon'],
        'icon-size': ICON_SIZE,
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
      },
    });

    if (hutsInteractionsBound) return;
    hutsInteractionsBound = true;

    map.on('click', 'clusters', (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      const clusterId = features[0]?.properties?.cluster_id;
      const source = map.getSource('huts') as GeoJSONSource;
      if (clusterId == null) return;
      source.getClusterExpansionZoom(clusterId).then((zoom) => {
        const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number];
        map.easeTo({ center: coords, zoom });
      });
    });

    map.on('click', 'unclustered', (e) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const props = feature.properties as HutFeatureProperties;
      if (isHoverCapable()) {
        location.href = hutHref(props.slug);
      } else {
        openBottomSheet(props.id);
      }
    });

    map.on('mouseenter', 'clusters', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'clusters', () => (map.getCanvas().style.cursor = ''));
    map.on('mouseenter', 'unclustered', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'unclustered', () => (map.getCanvas().style.cursor = ''));

    setupHoverPopup(map);
  }

  // setStyle() (used by the style switcher below) wipes any custom images
  // added via addImage() along with the rest of the previous style, so the
  // icons need reloading every time, not just on the initial 'load' — a
  // symbol layer whose icon-image no longer exists renders nothing, which
  // is why huts silently disappeared when switching to the topo style.
  function loadIconsAndAddLayers(): void {
    Promise.all([rasterizeSvgIcon(RIFUGIO_ICON_URI), rasterizeSvgIcon(BIVACCO_ICON_URI)]).then(([rifugio, bivacco]) => {
      if (!map.hasImage('rifugio-icon')) map.addImage('rifugio-icon', rifugio);
      if (!map.hasImage('bivacco-icon')) map.addImage('bivacco-icon', bivacco);
      addHutsLayers(filterCollection(allFeatures, currentState));
    });
  }

  map.on('load', loadIconsAndAddLayers);

  // --- Hover popup (desktop) ---
  function isHoverCapable(): boolean {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }

  function cardHtmlFor(id: string): string | null {
    const tpl = document.querySelector<HTMLTemplateElement>(`template[data-hut-card="${CSS.escape(id)}"]`);
    return tpl ? tpl.innerHTML : null;
  }

  function setupHoverPopup(map: MapLibreMap): void {
    let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
    let hidePopupTimeout: ReturnType<typeof setTimeout> | null = null;
    let popup: Popup | null = null;

    map.on('mousemove', 'unclustered', (e) => {
      if (!isHoverCapable()) return;
      const feature = e.features?.[0];
      if (!feature) return;
      const props = feature.properties as HutFeatureProperties;
      if (popup && (popup as unknown as { _hutId?: string })._hutId === props.id) return;

      if (hoverTimeout) clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        const html = cardHtmlFor(props.id);
        if (!html) return;
        popup?.remove();
        const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
        popup = new Popup({ closeButton: false, closeOnClick: false, offset: 28, maxWidth: 'none' })
          .setLngLat(coords)
          .setHTML(html)
          .addTo(map);
        (popup as unknown as { _hutId: string })._hutId = props.id;
        const el = popup.getElement();
        el.addEventListener('mouseenter', () => {
          if (hidePopupTimeout) clearTimeout(hidePopupTimeout);
        });
        el.addEventListener('mouseleave', () => schedulePopupHide());
      }, 120);
    });

    function schedulePopupHide(): void {
      if (hidePopupTimeout) clearTimeout(hidePopupTimeout);
      hidePopupTimeout = setTimeout(() => {
        popup?.remove();
        popup = null;
      }, 150);
    }

    map.on('mouseleave', 'unclustered', () => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
      schedulePopupHide();
    });
  }

  // --- Bottom sheet (mobile tap) ---
  function openBottomSheet(id: string): void {
    const sheet = document.getElementById('hut-bottom-sheet');
    const content = document.getElementById('hut-bottom-sheet-content');
    const html = cardHtmlFor(id);
    if (!sheet || !content || !html) return;
    content.innerHTML = html;
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add('is-open'));
  }

  document.getElementById('hut-bottom-sheet-close')?.addEventListener('click', () => {
    const sheet = document.getElementById('hut-bottom-sheet');
    sheet?.classList.remove('is-open');
    setTimeout(() => {
      if (sheet) sheet.hidden = true;
    }, 200);
  });

  // --- Legend ---
  document.getElementById('map-legend-toggle')?.addEventListener('click', () => {
    const legend = document.getElementById('map-legend');
    const toggle = document.getElementById('map-legend-toggle');
    if (!legend || !toggle) return;
    legend.hidden = !legend.hidden;
    toggle.setAttribute('aria-expanded', String(!legend.hidden));
  });

  function showLegendFor(styleName: string): void {
    document.querySelectorAll<HTMLElement>('[data-legend-for]').forEach((el) => {
      el.hidden = el.dataset.legendFor !== styleName;
    });
  }

  // --- Style switcher ---
  document.querySelectorAll<HTMLButtonElement>('[data-map-style]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-map-style]').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      const styleName = btn.dataset.mapStyle ?? 'standard';
      showLegendFor(styleName);
      map.once('styledata', loadIconsAndAddLayers);
      map.setStyle(styleName === 'topo' ? topoStyle() : LIBERTY_STYLE_URL);
    });
  });

  // --- Filters ---
  let currentState = readStateFromUrl({ altMin: defaultAltMin, altMax: defaultAltMax });

  function applyStateToForm(state: FilterState): void {
    document.querySelectorAll<HTMLInputElement>('input[data-filter="type"]').forEach((el) => {
      el.checked = state.types.has(el.value);
    });
    const altMin = document.getElementById('filter-alt-min') as HTMLInputElement | null;
    const altMax = document.getElementById('filter-alt-max') as HTMLInputElement | null;
    if (altMin) altMin.value = String(state.altMin);
    if (altMax) altMax.value = String(state.altMax);
    const freeOnly = document.getElementById('filter-free-only') as HTMLInputElement | null;
    if (freeOnly) freeOnly.checked = state.freeOnly;
    document.querySelectorAll<HTMLInputElement>('input[data-filter="facility"]').forEach((el) => {
      el.checked = state.facilities.has(el.value);
    });
    const country = document.getElementById('filter-country') as HTMLSelectElement | null;
    if (country) country.value = state.country;
    const region = document.getElementById('filter-region') as HTMLSelectElement | null;
    if (region) region.value = state.region;
    const search = document.getElementById('filter-search') as HTMLInputElement | null;
    if (search) search.value = state.search;
  }

  function readStateFromForm(): FilterState {
    const types = new Set(
      [...document.querySelectorAll<HTMLInputElement>('input[data-filter="type"]:checked')].map((el) => el.value),
    );
    const altMin = Number((document.getElementById('filter-alt-min') as HTMLInputElement | null)?.value ?? defaultAltMin);
    const altMax = Number((document.getElementById('filter-alt-max') as HTMLInputElement | null)?.value ?? defaultAltMax);
    const freeOnly = (document.getElementById('filter-free-only') as HTMLInputElement | null)?.checked ?? false;
    const facilities = new Set(
      [...document.querySelectorAll<HTMLInputElement>('input[data-filter="facility"]:checked')].map((el) => el.value),
    );
    const country = (document.getElementById('filter-country') as HTMLSelectElement | null)?.value ?? '';
    const region = (document.getElementById('filter-region') as HTMLSelectElement | null)?.value ?? '';
    const search = (document.getElementById('filter-search') as HTMLInputElement | null)?.value ?? '';
    return { types, altMin, altMax, freeOnly, facilities, country, region, search };
  }

  function updateResultsCount(count: number): void {
    const el = document.getElementById('filter-results-count');
    if (el) el.textContent = resultsCountTemplate.replace('{count}', String(count));
  }

  function refilter(): void {
    currentState = readStateFromForm();
    writeStateToUrl(currentState);
    const filtered = filterCollection(allFeatures, currentState);
    const source = map.getSource('huts') as GeoJSONSource | undefined;
    source?.setData(filtered);
    updateResultsCount(filtered.features.length);
  }

  applyStateToForm(currentState);
  updateResultsCount(filterCollection(allFeatures, currentState).features.length);

  document.querySelectorAll('[data-filter]').forEach((el) => {
    el.addEventListener('input', refilter);
    el.addEventListener('change', refilter);
  });

  document.getElementById('filter-reset')?.addEventListener('click', () => {
    currentState = { types: new Set(['bivacco']), altMin: defaultAltMin, altMax: defaultAltMax, freeOnly: false, facilities: new Set(), country: '', region: '', search: '' };
    applyStateToForm(currentState);
    writeStateToUrl(currentState);
    const filtered = filterCollection(allFeatures, currentState);
    (map.getSource('huts') as GeoJSONSource | undefined)?.setData(filtered);
    updateResultsCount(filtered.features.length);
  });

  // --- Near me ---
  let userMarker: Marker | null = null;
  document.getElementById('filter-near-me')?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert(nearMeErrorMessage);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        map.flyTo({ center: [longitude, latitude], zoom: 12 });
        userMarker?.remove();
        const el = document.createElement('div');
        el.className = 'user-location-marker';
        userMarker = new Marker({ element: el }).setLngLat([longitude, latitude]).addTo(map);
        try {
          sessionStorage.setItem('user-location', JSON.stringify({ lat: latitude, lon: longitude }));
        } catch {
          // sessionStorage unavailable — the map still centers correctly, only list-page distance sort is skipped.
        }
      },
      () => alert(nearMeErrorMessage),
    );
  });
}
