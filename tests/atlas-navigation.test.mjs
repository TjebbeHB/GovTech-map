import test from 'node:test';
import assert from 'node:assert/strict';
import {mapURL,discoveryReturn} from '../web/atlas-navigation.mjs';
test('map navigation opens actual map and round-trips independent discovery filters/detail',()=>{
  const back='/?q=privacy&themes=privacy-pet&actors=market&entity=bluegen';
  const u=new URL(mapURL({returnTo:back,entity:{id:'bluegen',entity_type:'organisation',country:'NL'}}),'https://example.org');
  assert.equal(u.pathname,'/atlas.html');assert.equal(u.searchParams.get('view'),'map');assert.equal(u.searchParams.get('org'),'bluegen');assert.equal(discoveryReturn(u.searchParams.get('return')),back);assert.equal(u.searchParams.has('q'),false);
});
test('map widens geography for selected foreign actors and never invents solution pins',()=>{
  let p=new URL(mapURL({scope:'zh',entity:{id:'dinum',entity_type:'organisation',country:'FR'}}),'https://example.org').searchParams;
  assert.equal(p.get('scope'),'eu');assert.equal(p.get('org'),'dinum');
  p=new URL(mapURL({entity:{id:'solution-demo',entity_type:'innovation',country:'NL'}}),'https://example.org').searchParams;
  assert.equal(p.has('org'),false);
});
test('return navigation rejects external and non-discovery routes',()=>{
  for(const path of ['https://evil.example','//evil.example','/\\evil.example','/atlas.html','/api/suggestions','/../server.py'])assert.equal(discoveryReturn(path),'/');
});
