// Making text from the feeds safe to put in the page as HTML. No Leaflet and no page, so node can test it.
//
// Leaflet tooltips and our "On your route" list take HTML. Names like airports, SIGMETs and volcanoes come
// from outside feeds, so a name such as "<b>Etna</b>" or "Smith & Sons" must show as those exact characters,
// not be read as HTML by the browser.

const REPLACEMENTS = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// escapeHtml('Ash <b>cloud</b>') is 'Ash &lt;b&gt;cloud&lt;/b&gt;'.
// Anything that isn't a string is turned into one first, and null or undefined becomes ''.
export function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/[&<>"']/g, (ch) => REPLACEMENTS[ch]);
}
