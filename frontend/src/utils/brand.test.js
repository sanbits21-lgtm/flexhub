import test from 'node:test';
import assert from 'node:assert/strict';
import { strongAccent } from './brand.js';

// The accent that is readable on white (text, chart lines, focus rings in the light theme), derived from any brand colour.
const lum = ([r, g, b]) => { const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contrastOnWhite = (rgb) => 1.05 / (lum(rgb) + 0.05);

test('lime, the default brand colour, is darkened until it reads on white (4.5:1) and stays green', () => {
  const lime = [200, 248, 58];
  assert.ok(contrastOnWhite(lime) < 2); // as it is, it is washed out on white
  const out = strongAccent(lime);
  assert.ok(contrastOnWhite(out) >= 4.5, `contrast ${contrastOnWhite(out)}`);
  assert.ok(out[1] > out[0] && out[1] > out[2], 'still green');
});

test('a colour that already reads on white is left exactly as it is', () => {
  assert.deepEqual(strongAccent([37, 99, 235]), [37, 99, 235]); // a strong blue
  assert.deepEqual(strongAccent([21, 128, 61]), [21, 128, 61]);
});

test('any brand colour a gym might pick comes out readable', () => {
  for (const rgb of [[255, 214, 10], [255, 255, 255], [250, 204, 21], [244, 114, 182], [34, 211, 238], [163, 230, 53], [255, 140, 0]]) {
    const out = strongAccent(rgb);
    assert.ok(contrastOnWhite(out) >= 4.5, `${rgb} -> ${out} gives ${contrastOnWhite(out).toFixed(2)}`);
    out.forEach((v) => assert.ok(Number.isInteger(v) && v >= 0 && v <= 255));
  }
});
