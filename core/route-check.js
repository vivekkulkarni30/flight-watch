// Route check: which warnings does a flight's path pass through or near?
//
// Plain geometry, no web or network code. Points are { lat, lon } in degrees; polygon corners are
// [lat, lon] pairs, the same as a Warning's shape.coords.
//
// Distances use a flat approximation: one degree of latitude is about 111.2 km, and one degree of
// longitude is that times cos(latitude). Over the few hundred km we care about, that's within a few
// per cent of the true distance, which is plenty for "is this flight near a storm?".

const KM_PER_DEGREE = 111.2;

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
