import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readState,stateQuery,filterEntities} from '../web/portal-filters.mjs';
const catalogue=JSON.parse(fs.readFileSync(new URL('../web/data/catalogue.json',import.meta.url)));
const base=()=>readState('',catalogue);
const ids=s=>filterEntities(catalogue,{...base(),...s}).map(e=>e.id);
test('full overview preserves all unique catalogue entities',()=>{assert.equal(ids({}).length,catalogue.entities.length);assert.equal(new Set(ids({})).size,ids({}).length);});
test('OR within actor and theme facets, AND across independent facets',()=>{
  const government=ids({actors:['government']}),market=ids({actors:['market']});
  assert.deepEqual(new Set(ids({actors:['market','government']})),new Set([...government,...market]));
  const privacy=ids({themes:['privacy-pet']}),data=ids({themes:['data']});
  assert.deepEqual(new Set(ids({themes:['privacy-pet','data']})),new Set([...privacy,...data]));
  assert.deepEqual(new Set(ids({themes:['data'],actors:['government'],types:['innovation']})),new Set(data.filter(id=>government.includes(id)&&catalogue.entities.find(e=>e.id===id).entity_type==='innovation')));
});
test('collaboration includes only itself, directly linked organisations and explicit solutions',()=>{
  for(const c of catalogue.entities.filter(e=>e.entity_type==='collaboration')){
    assert.deepEqual(new Set(ids({collaborations:[c.id]})),new Set([c.id,...c.organisation_ids,...c.innovation_ids]));
  }
  assert.ok(ids({collaborations:['govtech4all']}).includes('solution-pra-social-benefits'));
  assert.ok(!ids({collaborations:['govtech4all']}).includes('solution-la-suite'));
});
test('actor filter derives mixed-entity roles from direct organisations only',()=>{
  const fake={themes:[{id:'data',label:'Data'}],entities:[{id:'gov',name:'Gov',entity_type:'organisation',actor_types:['government'],themes:['data']},{id:'c',name:'C',entity_type:'collaboration',organisation_ids:['gov'],themes:['data']},{id:'s',name:'S',entity_type:'innovation',organisation_ids:[],collaboration_ids:['c'],themes:['data']}]};
  assert.deepEqual(filterEntities(fake,{...base(),actors:['government']}).map(e=>e.id).sort(),['c','gov']);
});
test('all search terms intersect themes/types/actors and support accents',()=>{
  assert.ok(ids({q:'synthetische',themes:['privacy-pet'],types:['innovation']}).includes('solution-bluegen'));
  assert.equal(ids({q:'synthetische',themes:['rules-as-code'],types:['innovation']}).length,0);
  assert.equal(ids({q:'not-an-existing-question-zz'}).length,0);
});
test('reviewed identities remain findable by former names and every organisation has a known role',()=>{
  assert.ok(ids({q:'Hague Security Delta'}).includes('report-hague-security-delta'));
  assert.equal(catalogue.entities.find(e=>e.id==='report-hague-security-delta').name,'Security Delta (HSD)');
  for(const e of catalogue.entities.filter(e=>e.entity_type==='organisation')){
    assert.ok(e.actor_types.length>0,`${e.id} has no actor role`);
    assert.ok(e.actor_types.every(role=>['market','research','ngo','government'].includes(role)),e.id);
  }
});
test('strict geography never treats missing country or network coverage as NL',()=>{
  for(const id of ids({scope:'nl'}))assert.equal(catalogue.entities.find(e=>e.id===id).country,'NL');
  for(const id of ids({scope:'zh'})){const e=catalogue.entities.find(e=>e.id===id);assert.equal(e.country,'NL');assert.equal(e.province,'Zuid-Holland');}
  assert.ok(!ids({scope:'eu'}).includes('us-dhs'));
});
test('state is canonical, shareable, deduplicated and retains a detail independently',()=>{
  const s={...base(),q:'Privacy & overheid',themes:['data','privacy-pet'],actors:['government','market'],types:['innovation'],collaborations:['govtech4all'],view:'grouped',sort:'collaborations',entity:'dinum',embed:true};
  const parsed=readState('?'+stateQuery(s),catalogue);
  assert.equal(stateQuery(parsed),stateQuery(s));assert.deepEqual(new Set(ids(parsed)),new Set(ids(s)));
  const invalid=readState('?themes=data,data,unknown&actors=madeup&types=innovation,innovation&entity=missing',catalogue);
  assert.deepEqual(invalid.themes,['data']);assert.deepEqual(invalid.actors,[]);assert.deepEqual(invalid.types,['innovation']);assert.equal(invalid.entity,'');
});
test('sorts are deterministic and collaboration metric is descending direct count',()=>{
  const sorted=filterEntities(catalogue,{...base(),sort:'collaborations'});
  for(let i=1;i<sorted.length;i++)assert.ok(sorted[i-1].collaboration_ids.length>=sorted[i].collaboration_ids.length);
  const az=filterEntities(catalogue,{...base(),sort:'az'}),c=new Intl.Collator('nl',{sensitivity:'base'});
  for(let i=1;i<az.length;i++)assert.ok(c.compare(az[i-1].name,az[i].name)<=0);
});
