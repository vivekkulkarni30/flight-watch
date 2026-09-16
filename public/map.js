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

// Draw the flight's path as a line, put a marker on the last point (where the plane is now)
// and zoom the map to fit the whole path.
function showFlight(flight) {
  if (flightLayer) {
    flightLayer.remove();
  }

  const points = flight.points.map((p) => [p.lat, p.lon]);
  const path = L.polyline(points, { color: '#d9480f', weight: 3 });
  const plane = L.marker(points[points.length - 1]).bindTooltip(flight.callsign, { permanent: true });

  flightLayer = L.layerGroup([path, plane]).addTo(map);
  map.fitBounds(path.getBounds(), { padding: [40, 40] });
}

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';

  try {
    const res = await fetch(`/api/flight/${flightInput.value}`);
    const data = await res.json();

    if (res.status === 404) {
      message.textContent = 'Flight not found';
      return;
    }
    if (!res.ok) {
      message.textContent = 'Flight data is unavailable right now, try again soon.';
      return;
    }

    showFlight(data);
  } catch (err) {
    message.textContent = 'Flight data is unavailable right now, try again soon.';
  }
});
