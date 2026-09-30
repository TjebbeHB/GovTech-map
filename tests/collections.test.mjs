import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {COLLECTIONS, collectionIds} from '../web/collections.mjs';

test('collection follows only a seed’s direct owners and programmes', () => {
  const catalogue = {entities: [
    {id: 'solution-gdi-digid', entity_type: 'innovation', organisation_ids: ['owner', 'missing'], collaboration_ids: ['programme']},
    {id: 'owner', entity_type: 'organisation', innovation_ids: ['other-product'], collaboration_ids: ['unrelated-network']},
    {id: 'programme', entity_type: 'collaboration', organisation_ids: ['other-owner'], innovation_ids: ['other-product']},
    {id: 'other-owner', entity_type: 'organisation'},
    {id: 'other-product', entity_type: 'innovation'},
    {id: 'unrelated-network', entity_type: 'collaboration'},
  ]};
  const before = structuredClone(catalogue);
  assert.deepEqual(collectionIds(catalogue, 'gdi'), new Set(['solution-gdi-digid', 'owner', 'programme']));
  assert.deepEqual(catalogue, before);
});

test('a programme seed does not collect all its child solutions', () => {
  const catalogue = {entities: [
    {id: 'gdi-infrastructuur', entity_type: 'collaboration', organisation_ids: ['owner'], innovation_ids: ['unselected-product']},
    {id: 'owner', entity_type: 'organisation'},
    {id: 'unselected-product', entity_type: 'innovation'},
  ]};
  assert.deepEqual(collectionIds(catalogue, 'gdi'), new Set(['gdi-infrastructuur', 'owner']));
});

test('unknown collections, missing seeds and organisation-only seeds cannot add padding', () => {
  const catalogue = {entities: [{id: 'solution-gdi-digid', entity_type: 'organisation'}]};
  for (const key of ['gdi', 'unknown', 'constructor', '__proto__']) {
    assert.deepEqual(collectionIds(catalogue, key), new Set());
  }
});

test('editorial shortcuts use unique substantive seeds and preserve existing municipal tools', () => {
  const catalogue = JSON.parse(fs.readFileSync(new URL('../web/data/catalogue.json', import.meta.url)));
  const byId = new Map(catalogue.entities.map(e => [e.id, e]));
  for (const collection of Object.values(COLLECTIONS)) {
    assert.ok(collection.label);
    assert.ok(collection.seedIds.length);
    assert.equal(new Set(collection.seedIds).size, collection.seedIds.length);
    for (const id of collection.seedIds) {
      assert.ok(['innovation', 'collaboration'].includes(byId.get(id)?.entity_type), id);
    }
  }
  for (const id of ['solution-open-zaak', 'solution-open-formulieren', 'solution-open-inwoner']) {
    assert.ok(COLLECTIONS.municipal.seedIds.includes(id));
  }
  assert.ok(!COLLECTIONS.canada.seedIds.includes('ca-eu-digital-partnership'));
  assert.ok(COLLECTIONS['eu-canada'].seedIds.includes('ca-eu-digital-partnership'));
});
