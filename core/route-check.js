// Route check: which warnings does a flight's path pass through or near?
//
// Plain geometry, no web or network code. Points are { lat, lon } in degrees; polygon corners are
// [lat, lon] pairs, the same as a Warning's shape.coords.
//
// Distances use a flat approximation: one degree of latitude is about 111.2 km, and one degree of
// longitude is that times cos(latitude). Over the few hundred km we care about, that's within a few
// per cent of the true distance, which is plenty for "is this flight near a storm?".

const KM_PER_DEGREE = 111.2;
const EARTH_RADIUS_KM = 6371;
const LONG_LEG_KM = 500;

// Long legs (over 500 km) get points added along the great circle, the way the plane flies, so no piece is over maxKm.
export function densify(points, maxKm = 250) {
  const out = points.slice(0, 1);
  for (let i = 1; i < points.length; i++) {
    const a = toVector(points[i - 1]);
    const b = toVector(points[i]);
    const angle = Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
    const km = angle * EARTH_RADIUS_KM;
    if (km > LONG_LEG_KM) {
      const pieces = Math.ceil(km / maxKm);
      for (let k = 1; k < pieces; k++) out.push(between(a, b, angle, k / pieces));
    }
    out.push(points[i]);
  }
  return out;
}

// A point as a 3D unit vector from the centre of the Earth.
function toVector({ lat, lon }) {
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

// The point fraction f of the way from a to b along the great circle (spherical linear interpolation).
function between(a, b, angle, f) {
  const wa = Math.sin((1 - f) * angle) / Math.sin(angle);
  const wb = Math.sin(f * angle) / Math.sin(angle);
  const [x, y, z] = [0, 1, 2].map((i) => wa * a[i] + wb * b[i]);
  return { lat: (Math.asin(z) * 180) / Math.PI, lon: (Math.atan2(y, x) * 180) / Math.PI };
}

// Is the point inside the polygon? Cast a line due east from the point and count how many edges it
// crosses: an odd count means inside.
export function pointInPolygon({ lat, lon }, coords) {
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [latI, lonI] = coords[i];
    const [latJ, lonJ] = coords[j];
    if (latI > lat === latJ > lat) continue; // edge is wholly above or below the point
    const lonAtLat = lonI + ((lat - latI) / (latJ - latI)) * (lonJ - lonI);
    if (lon < lonAtLat) inside = !inside;
  }
  return inside;
}

// Which side of the line a->b is c on? Positive one side, negative the other, 0 on the line.
function side(a, b, c) {
  return (b.lon - a.lon) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lon - a.lon);
}

// Do the legs a->b and c->d cross (or touch)? They do when each one's ends lie on opposite sides of the other.
export function segmentsCross(a, b, c, d) {
  const s1 = side(c, d, a);
  const s2 = side(c, d, b);
  const s3 = side(a, b, c);
  const s4 = side(a, b, d);
  if (((s1 > 0 && s2 < 0) || (s1 < 0 && s2 > 0)) && ((s3 > 0 && s4 < 0) || (s3 < 0 && s4 > 0))) return true;
  // Touching: an end of one leg sits exactly on the other.
  return (
    (s1 === 0 && onSegment(c, d, a)) ||
    (s2 === 0 && onSegment(c, d, b)) ||
    (s3 === 0 && onSegment(a, b, c)) ||
    (s4 === 0 && onSegment(a, b, d))
  );
}

// p is on the line through a and b; is it between them?
function onSegment(a, b, p) {
  return (
    Math.min(a.lat, b.lat) <= p.lat && p.lat <= Math.max(a.lat, b.lat) &&
    Math.min(a.lon, b.lon) <= p.lon && p.lon <= Math.max(a.lon, b.lon)
  );
}

// Distance in km from point p to the leg a->b (flat approximation, see the top of the file).
export function kmFromSegment(p, a, b) {
  const midLat = (p.lat + a.lat + b.lat) / 3;
  const kmPerLon = KM_PER_DEGREE * Math.cos((midLat * Math.PI) / 180);
  // Put a at (0, 0) and measure everything in km from there.
  const bx = (b.lon - a.lon) * kmPerLon;
  const by = (b.lat - a.lat) * KM_PER_DEGREE;
  const px = (p.lon - a.lon) * kmPerLon;
  const py = (p.lat - a.lat) * KM_PER_DEGREE;
  // How far along a->b the nearest point is: 0 at a, 1 at b, kept between the two.
  const lengthSquared = bx * bx + by * by;
  const along = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / lengthSquared));
  return Math.hypot(px - along * bx, py - along * by);
}

// The warnings a flight's path passes through, or comes within bufferKm of.
//   path:     { callsign, icao24, points: [{ t, lat, lon, altM }] }
//   warnings: [{ id, kind, hazard, ..., shape: { type: 'polygon', coords: [[lat, lon], ...] } }]
//             or, for kind 'volcano', shape: { type: 'circle', center: [lat, lon], radiusKm }
// Any other shape type is skipped.
// TODO: this doesn't look at validFrom/validTo yet, so a warning counts even if it has expired or not
// started by the time the flight gets there.
export function warningsOnRoute(path, warnings, { bufferKm = 50 } = {}) {
  const legs = legsOf(densify(path.points));
  return warnings.filter((w) => {
    // Volcanoes are circles; everything else is a SIGMET polygon.
    if (w.kind === 'volcano') {
      const [lat, lon] = w.shape.center;
      return legs.some(([a, b]) => kmFromSegment({ lat, lon }, a, b) <= w.shape.radiusKm + bufferKm);
    }
    return w.shape?.type === 'polygon' && legs.some(([a, b]) => legNearPolygon(a, b, w.shape.coords, bufferKm));
  });
}

// Consecutive points make the legs. A path with one point is a leg that starts and ends there.
function legsOf(points) {
  if (points.length === 1) return [[points[0], points[0]]];
  return points.slice(1).map((b, i) => [points[i], b]);
}

// The polygon's edges as pairs of { lat, lon } points, the last corner joining back to the first.
function edgesOf(coords) {
  const corners = coords.map(([lat, lon]) => ({ lat, lon }));
  return corners.map((c, i) => [c, corners[(i + 1) % corners.length]]);
}

// A leg counts if either end is inside, it crosses an edge, or it comes within bufferKm of an edge.
function legNearPolygon(a, b, coords, bufferKm) {
  if (pointInPolygon(a, coords) || pointInPolygon(b, coords)) return true;
  return edgesOf(coords).some(([c, d]) => segmentsCross(a, b, c, d) || kmBetweenSegments(a, b, c, d) <= bufferKm);
}

// Shortest distance in km between two legs that don't cross: it's always from an end of one to the other.
function kmBetweenSegments(a, b, c, d) {
  return Math.min(kmFromSegment(a, c, d), kmFromSegment(b, c, d), kmFromSegment(c, a, b), kmFromSegment(d, a, b));
}
