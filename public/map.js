// The world map. Leaflet is loaded from the CDN in index.html.
const map = L.map('map').setView([20, 0], 2);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

// Airport dots. If the request fails we just keep the map without them.
async function showAirports() {
  try {
    const res = await fetch('/api/airports');
    if (!res.ok) return;
    const airports = await res.json();

    for (const airport of airports) {
      L.circleMarker([airport.lat, airport.lon], {
        radius: 3,
        color: '#1f3a5f',
        weight: 1,
        fillColor: '#3c78c3',
        fillOpacity: 0.8,
      })
        .bindTooltip(`${airport.iata} ${airport.name}`)
        .addTo(map);
    }
  } catch (err) {
    // No airports, but the map still works.
  }
}

showAirports();

// Flight search. Asks the server for the flight the user typed.
const searchForm = document.getElementById('search');
const flightInput = document.getElementById('flight');
const message = document.getElementById('message');

// The path and plane marker currently on the map, so a new search can remove them.
let flightLayer = null;

// Remove the last flight's path and marker, if there is one.
function clearFlight() {
  if (flightLayer) {
    flightLayer.remove();
    flightLayer = null;
  }
  hideRoutePanel();
}

// Draw the flight's path as a line, put a marker on the last point (where the plane is now)
// and zoom the map to fit the whole path.
function showFlight(flight) {
  const points = flight.points.map((p) => [p.lat, p.lon]);
  const path = L.polyline(points, { color: '#d9480f', weight: 3 });
  const plane = L.marker(points[points.length - 1]).bindTooltip(flight.callsign, { permanent: true });

  flightLayer = L.layerGroup([path, plane]).addTo(map);
  map.fitBounds(path.getBounds(), { padding: [40, 40] });
}

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';
  // Clear the old flight first, so a 404 or 502 doesn't leave it looking like the answer.
  clearFlight();

  // Trim spaces and encode the text, so a / or ? typed in the box can't change the request.
  const flightNumber = flightInput.value.trim();
  if (!flightNumber) return;

  try {
    const res = await fetch(`/api/flight/${encodeURIComponent(flightNumber)}`);

    // Check the status before reading the body: an error page from a proxy isn't JSON,
    // and res.json() would throw on it.
    if (res.status === 404) {
      message.textContent = 'Flight not found';
      return;
    }
    if (!res.ok) {
      message.textContent = 'Flight data is unavailable right now, try again soon.';
      return;
    }

    const data = await res.json();

    // OpenSky can know a flight but have no positions for it yet (it has only just taken off).
    // Without points there's no path to draw and no last point for the marker.
    if (!data.points || data.points.length === 0) {
      message.textContent = 'No position data for this flight yet';
      return;
    }

    showFlight(data);
    showRoutePanel(data.onRoute);
  } catch (err) {
    message.textContent = 'Flight data is unavailable right now, try again soon.';
  }
});

// Warning areas (SIGMETs): storms, turbulence, icing and so on, drawn as coloured shapes.
// Asked for when the page loads and again every minute.

// The colour and the words for each kind of hazard. The shapes and the legend both read from
// this one table, so they can't disagree.
const HAZARDS = {
  TS: { color: '#7b2cbf', label: 'Thunderstorms' },
  TURB: { color: '#f08c00', label: 'Turbulence' },
  ICE: { color: '#74c0fc', label: 'Icing' },
  VA: { color: '#868e96', label: 'Volcanic ash' },
  TC: { color: '#e03131', label: 'Tropical cyclone' },
  MTW: { color: '#8b5a2b', label: 'Mountain waves' },
};
const OTHER_HAZARD = { color: '#fcc419', label: 'Other hazard' };

function hazardStyle(hazard) {
  return HAZARDS[hazard] ?? OTHER_HAZARD;
}

// The warning shapes currently on the map, so the next refresh can replace them.
let warningLayer = null;

// Each warning's shape on the map by its id, so the "On your route" list can find it.
let polygonsById = new Map();

// "Valid until" in the viewer's own time, e.g. "Wed 24 Sep, 3:00 pm".
function formatTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function drawWarnings(warnings) {
  const shapes = [];
  const byId = new Map();
  for (const warning of warnings) {
    if (warning.shape?.type !== 'polygon') continue;
    const style = hazardStyle(warning.hazard);
    const polygon = L.polygon(warning.shape.coords, {
      color: style.color,
      weight: 1,
      fillColor: style.color,
      fillOpacity: 0.3,
    }).bindTooltip(`${warning.name}<br>${style.label}<br>Valid until ${formatTime(warning.validTo)}`);
    shapes.push(polygon);
    byId.set(warning.id, polygon);
  }

  // Swap the old layer for the new one in one go.
  if (warningLayer) warningLayer.remove();
  warningLayer = L.layerGroup(shapes).addTo(map);
  polygonsById = byId;

  // The refresh drew fresh shapes, so mark the ones on the route again.
  highlightRoute();
}

// If the request fails, keep whatever shapes are already on the map.
async function showWarnings() {
  try {
    const res = await fetch('/api/warnings');
    if (!res.ok) return;
    const warnings = await res.json();
    drawWarnings(warnings);
  } catch (err) {
    // Keep the last shapes.
  }
}

showWarnings();
setInterval(showWarnings, 60 * 1000);

// A small legend in the bottom-left corner so people know what the colours mean.
const legend = L.control({ position: 'bottomleft' });
legend.onAdd = function () {
  const div = L.DomUtil.create('div', 'legend');
  const rows = [...Object.values(HAZARDS), OTHER_HAZARD].map(
    (h) => `<div><span class="swatch" style="background:${h.color}"></span>${h.label}</div>`,
  );
  div.innerHTML = `<strong>Warnings</strong>${rows.join('')}`;
  return div;
};
legend.addTo(map);

// "On your route": the warnings near the searched flight's path. The server works out which ones
// (onRoute in the /api/flight answer); the page lists them on the right and marks them on the map.
const routePanel = document.getElementById('route-panel');
const routeToggle = document.getElementById('route-toggle');
const routeList = document.getElementById('route-list');

// The ids of the warnings on the current flight's route, so a refresh can highlight them again.
let routeIds = new Set();

function routeItemHtml(warning) {
  const style = hazardStyle(warning.hazard);
  return `<li data-id="${warning.id}">
    <span class="dot" style="background:${style.color}"></span>${style.label}: ${warning.name}
    <div class="until">until ${formatTime(warning.validTo)}</div>
  </li>`;
}

function showRoutePanel(onRoute) {
  routeIds = new Set(onRoute?.map((w) => w.id));
  routeList.innerHTML = onRoute?.map(routeItemHtml).join('');

  // Clicking an item zooms the map to that warning's shape.
  routeList.onclick = (event) => {
    const item = event.target.closest('li');
    if (!item) return;
    const warning = onRoute.find((w) => w.id === item.dataset.id);
    if (warning?.shape?.type === 'polygon') {
      map.fitBounds(L.polygon(warning.shape.coords).getBounds(), { padding: [40, 40] });
    }
  };

  routePanel.hidden = false;
  map.invalidateSize(); // the map got narrower
  highlightRoute();
}

function hideRoutePanel() {
  routeIds = new Set();
  routeList.innerHTML = '';
  routePanel.hidden = true;
  map.invalidateSize();
  highlightRoute();
}

// Thicker outline and stronger fill for the warnings on the route; the rest go back to normal.
function highlightRoute() {
  for (const [id, polygon] of polygonsById) {
    const onRoute = routeIds.has(id);
    polygon.setStyle({ weight: onRoute ? 3 : 1, fillOpacity: onRoute ? 0.5 : 0.3 });
    if (onRoute) polygon.bringToFront();
  }
}

// On a phone the title opens and closes the list (the CSS only hides it on small screens).
routeToggle.addEventListener('click', () => {
  const collapsed = routePanel.classList.toggle('collapsed');
  routeToggle.setAttribute('aria-expanded', String(!collapsed));
  map.invalidateSize();
});
