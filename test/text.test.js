import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../public/text.js';

// Names from the feeds go into tooltips and the "On your route" list as HTML, so they're escaped first.

test('plain text comes back unchanged', () => {
  assert.equal(escapeHtml('Sydney Kingsford Smith Airport'), 'Sydney Kingsford Smith Airport');
  assert.equal(escapeHtml(''), '');
});

test('< and > become &lt; and &gt;, so a tag shows as text', () => {
  assert.equal(escapeHtml('<b>Etna</b>'), '&lt;b&gt;Etna&lt;/b&gt;');
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
});

test('& becomes &amp;, and is done first so nothing is escaped twice', () => {
  assert.equal(escapeHtml('Smith & Sons'), 'Smith &amp; Sons');
  assert.equal(escapeHtml('&lt;'), '&amp;lt;');
});

test('both kinds of quote are escaped, so text is safe inside an attribute too', () => {
  assert.equal(escapeHtml('say "hi"'), 'say &quot;hi&quot;');
  assert.equal(escapeHtml("O'Hare"), 'O&#39;Hare');
  assert.equal(escapeHtml(`" onclick="x`), '&quot; onclick=&quot;x');
});

test('anything that is not a string is turned into one', () => {
  assert.equal(escapeHtml(42), '42');
  assert.equal(escapeHtml(0), '0');
  assert.equal(escapeHtml(false), 'false');
  assert.equal(escapeHtml({ toString: () => '<x>' }), '&lt;x&gt;');
});

test('null and undefined become an empty string, not "null" or "undefined"', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});
