import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,createSearchIndex,searchMatch,searchSuggestions} from '../web/search.mjs';
import {filterEntities,readState,stateQuery} from '../web/portal-filters.mjs';
import {inScope} from '../web/geography.mjs';
import {mapURL} from '../web/atlas-navigation.mjs';
const entities=[
 {id:'cg',name:'Common Ground',entity_type:'collaboration',country:'NL',themes:['data'],description:'Gemeentelijke digitale infrastructuur',aliases:['CG']},
 {id:'cg2',name:'Andere toepassing',entity_type:'innovation',country:'NL',themes:['data'],description:'Gebaseerd op Common Ground'},
 {id:'gdi',name:'Generieke Digitale Infrastructuur',entity_type:'collaboration',country:'NL',themes:['data'],aliases:['GDI']},
 {id:'identity',name:'Digitale identiteit',entity_type:'innovation',country:'NL',themes:['data']},
 {id:'accent',name:'École du numérique',entity_type:'organisation',country:'FR',themes:[],aliases:['École numérique']},
 {id:'ca',name:'CanadaLogin',entity_type:'innovation',country:'CA',themes:['data'],aliases:['GC Sign in'],description:'Digital identity'},
 {id:'noise',name:'Kaaien en detailhandel',entity_type:'organisation',country:'US',themes:[]}
];
const catalogue={themes:[{id:'data',label:'Data'}],entities},index=createSearchIndex(entities),base=()=>readState('',catalogue);
const find=q=>entities.filter(e=>searchMatch(index.get(e.id),q)).map(e=>e.id);
test('case, accents, punctuation, aliases and unordered words work in shared engine',()=>{
 assert.equal(normalize(' ÉCOLE—numérique! '),'ecole numerique');
 assert.ok(find('ground common').includes('cg'));
 assert.ok(find('ÉCOLE-du numérique').includes('accent'));
 assert.ok(find('GC-Sign-in').includes('ca'));
 assert.ok(find('GDI').includes('gdi'));
});
test('bounded bilingual concepts retrieve the same entries',()=>{
 assert.deepEqual(find('digital identity'),find('digitale identiteit'));
 assert.ok(find('digital identity').includes('identity'));
 assert.deepEqual(find('GDI'),find('generieke digitale infrastructuur'));
});
test('one edit and transposition work but short acronyms do not acquire fuzzy or substring noise',()=>{
 assert.ok(find('comon ground').includes('cg'));
 assert.ok(find('common groudn').includes('cg'));
 assert.deepEqual(find('GDX'),[]);assert.deepEqual(find('AI'),[]);
 assert.deepEqual(find('comxxn grxxxx'),[]);
});
test('relevance ranks exact names first and respects explicit sort and facets',()=>{
 assert.equal(filterEntities(catalogue,{...base(),q:'Common Ground'})[0].id,'cg');
 assert.equal(filterEntities(catalogue,{...base(),q:'commmon ground'})[0].id,'cg');
 assert.equal(filterEntities(catalogue,{...base(),q:'ground common'})[0].id,'cg');
 assert.equal(filterEntities(catalogue,{...base(),q:'Common Ground',sort:'solutions'})[0].id,'cg2');
 assert.deepEqual(filterEntities(catalogue,{...base(),q:'digital identity',scope:'ca',types:['innovation'],themes:['data']}).map(e=>e.id),['ca']);
 assert.equal(filterEntities(catalogue,{...base(),q:'comon ground',scope:'ca'}).length,0);
 const s={...base(),q:'common groudn',scope:'ca',sort:'az',entity:'ca'};assert.equal(stateQuery(readState('?'+stateQuery(s),catalogue)),stateQuery(s));
});
test('suggestions are drawn only from provided filtered candidates',()=>{
 assert.deepEqual(searchSuggestions([entities[0]],index,'common grounxx'),['Common Ground']);
 assert.deepEqual(searchSuggestions([entities[5]],index,'common grounxx'),[]);
});
test('Canada never leaks into Europe and cross-view navigation retains Canada and discovery selection',()=>{
 assert.equal(inScope({country:'CA'},'eu'),false);assert.equal(inScope({country:'AU'},'eu'),false);assert.equal(inScope({country:'EU'},'eu'),true);assert.equal(inScope({country:null},'eu'),true);
 const back='/?q=GC+Sign+in&scope=ca&types=innovation&sort=az';
 const p=new URL(mapURL({scope:'eu',returnTo:back,entity:{id:'cds',entity_type:'organisation',country:'CA'}}),'https://local').searchParams;
 assert.equal(new URL(mapURL({entity:{id:'cds',entity_type:'organisation',country:'CA'}}),'https://local').searchParams.get('scope'),'ca');
 assert.equal(p.get('scope'),'ca');assert.equal(p.get('return'),back);assert.equal(p.get('org'),'cds');
 assert.equal(new URL(mapURL({scope:'ca',entity:entities[5]}),'https://local').searchParams.has('org'),false);
});

// Exercise the published data as well as small fixtures.
test('published GDI, Common Ground, Québec and combined filters stay discoverable',async()=>{
 const fs=await import('node:fs');const c=JSON.parse(fs.readFileSync(new URL('../web/data/catalogue.json',import.meta.url)));const b=readState('',c),find=(q,extra={})=>filterEntities(c,{...b,q,...extra}).map(e=>e.id);
 assert.equal(find('commmon ground')[0],'municipal-common-ground');assert.equal(find('ground common')[0],'municipal-common-ground');
 assert.ok(find('GDI').includes('solution-gdi-digipoort'));assert.deepEqual(find('Québec',{scope:'ca'}),find('Quebec',{scope:'ca'}));
 assert.deepEqual(new Set(find('digital identity')),new Set(find('digitale identiteit')));
 assert.ok(find('canadalogn',{scope:'ca',types:['innovation'],actors:['government']}).includes('solution-ca-canadalogin'));
 assert.equal(find('canadalogn',{scope:'eu'}).length,0);assert.equal(find('xxyyzznonsensequestion').length,0);
});
