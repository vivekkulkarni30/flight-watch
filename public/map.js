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
    console.log(airports);

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
