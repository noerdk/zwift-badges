import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, activeRoads, nextChange, load } from '../src/portals.js';
import { load as loadGameDict } from '../src/gamedict.js';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<PortalRoads>
  <PortalRoadMetadataCollections>
    <PortalRoadMetadata name="Cote de Trebiac" id="10009" distanceCentimeters="459264.21" elevCentimeters="20742.36"/>
    <PortalRoadMetadata name="Col d&apos;Aspin" id="10004" distanceCentimeters="1353582.25" elevCentimeters="81151.24"/>
  </PortalRoadMetadataCollections>
  <PortalRoadSchedule><appointments>
    <appointment road="10009" world="1" portal="0"  start="2026-09-10T00:01-04"/>
    <appointment road="10004" world="1" portal="0"  start="2026-09-12T00:01-04"/>
  </appointments></PortalRoadSchedule>
</PortalRoads>`;

test('centimetre fields become km and metres', () => {
  const { roads } = parse(XML);
  const t = roads.find((r) => r.id === 10009);
  assert.ok(Math.abs(t.distanceKm - 4.5926) < 0.001, `got ${t.distanceKm}`);
  assert.ok(Math.abs(t.elevationM - 207.42) < 0.01, `got ${t.elevationM}`);
});

test('XML entities in climb names are decoded', () => {
  assert.equal(parse(XML).roads.find((r) => r.id === 10004).name, "Col d'Aspin");
});

test('offsets without minutes parse (Zwift writes "-04", not "-04:00")', () => {
  // Regression: new Date('2026-09-10T00:01-04') is Invalid Date, which silently
  // dropped every appointment.
  const { schedule } = parse(XML);
  assert.equal(schedule.length, 2);
  assert.ok(schedule.every((a) => !Number.isNaN(a.start.getTime())));
});

test('the open climb is the last one scheduled before now', () => {
  const d = parse(XML);
  const on11 = activeRoads(d, new Date('2026-09-11T12:00:00Z'));
  assert.equal(on11.length, 1);
  assert.equal(on11[0].name, 'Cote de Trebiac', 'the 12th has not started yet');

  const on13 = activeRoads(d, new Date('2026-09-13T12:00:00Z'));
  assert.equal(on13[0].name, "Col d'Aspin");

  assert.equal(activeRoads(d, new Date('2026-01-01T00:00:00Z')).length, 0, 'nothing before the first appointment');
});

test('nextChange finds the upcoming rotation', () => {
  const d = parse(XML);
  assert.equal(nextChange(d, new Date('2026-09-11T12:00:00Z')).roadId, 10004);
  assert.equal(nextChange(d, new Date('2026-12-01T00:00:00Z')), null);
});

test('portal roads reconcile with GameDictionary after the unit fix', () => {
  // GameDictionary stores portal roads in centimetres under `...InMeters`.
  const gdPortals = loadGameDict().routes.filter((r) => r.isPortal);
  const byId = new Map(load().roads.map((r) => [r.id, r]));
  let checked = 0;
  for (const g of gdPortals) {
    const p = byId.get(g.id);
    if (!p) continue;
    checked++;
    assert.ok(Math.abs(g.distanceKm - p.distanceKm) < 0.02, `${g.name}: ${g.distanceKm} vs ${p.distanceKm}`);
  }
  assert.ok(checked > 40, `expected to check most portal roads, checked ${checked}`);
  assert.ok(gdPortals.every((r) => r.distanceKm < 60), 'no portal climb is 400km long');
});
