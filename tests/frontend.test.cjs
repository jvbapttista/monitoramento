const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = { window: {} };
context.MON = context.window.MON = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../frontend/static/js/formato.js'), 'utf8'), context);
const fmt = context.MON.fmt;

test('ausência e zero têm apresentações diferentes', () => {
  assert.equal(fmt.pct(null), '—');
  assert.equal(fmt.pct(0), '0,0%');
  assert.equal(fmt.n(NaN), '—');
});
test('texto externo não vira HTML', () => {
  assert.equal(fmt.esc('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
test('unidades de memória e tráfego são preservadas', () => {
  assert.equal(fmt.bytes(1024 * 1024), '1,0 MB');
  assert.equal(fmt.bps(125000), '1,0 Mbps');
});
test('CSV neutraliza fórmulas e preserva delimitadores', () => {
  for (const value of ['=1+1', '+1', '-1', '@SUM(A1)', '  =1']) {
    assert.ok(fmt.csvCelula(value).startsWith("'"));
  }
  assert.equal(fmt.csvCelula('a;b'), '"a;b"');
  assert.equal(fmt.csvCelula('a"b'), '"a""b"');
  assert.equal(fmt.csvCelula('a\rb'), '"a\rb"');
  assert.equal(fmt.csvCelula(null), '');
  assert.equal(fmt.csvCelula('PROJETO-A'), 'PROJETO-A');
});
