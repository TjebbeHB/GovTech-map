import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {buildLayout,bounds,wrapLabel,fullyVisible,centeredTransform,overviewTransform} from '../web/network-layout.mjs';
const require=createRequire(import.meta.url),d3=require('../web/vendor/d3.min.js');
const data=JSON.parse(readFileSync(new URL('../web/data/ecosystem.json',import.meta.url)));
const original=JSON.stringify(data);
const layout=buildLayout(data.organisations,data.relationships,d3);
const nodes=[...layout.values()];
const area={left:30,top:110,right:1130,bottom:715};

test('world layout preserves every entity/edge input and labels without truncation',()=>{
  assert.equal(layout.size,data.organisations.length);assert.deepEqual(new Set(layout.keys()),new Set(data.organisations.map(o=>o.id)));assert.equal(JSON.stringify(data),original);
  for(const n of nodes){assert(Number.isFinite(n.x)&&Number.isFinite(n.y));assert.equal(n.labelLines.join(' '),n.name.replace(/\s+/g,' ').trim());}
  assert(wrapLabel('A long public organisation name which should span multiple lines').length>1);
});
test('all node and multiline-label boxes have real spacing in world coordinates',()=>{
  const collisions=[];
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
    const a=nodes[i],b=nodes[j];
    const dx=Math.min(a.x+a.box.right-(b.x-b.box.left),b.x+b.box.right-(a.x-a.box.left));
    const dy=Math.min(a.y+a.box.bottom-(b.y-b.box.top),b.y+b.box.bottom-(a.y-a.box.top));
    if(dx>.5&&dy>.5)collisions.push([a.id,b.id,dx,dy]);
  }
  assert.deepEqual(collisions,[]);
  assert(bounds(nodes).width>3000);assert(bounds(nodes).height>2000);
});
test('readable camera intentionally leaves nodes offscreen; overview alone fits all',()=>{
  const anchor=layout.get('govtech4all'),camera=centeredTransform(anchor,area);
  assert.equal(camera.k,1);assert(fullyVisible(anchor,camera,area));
  const visible=nodes.filter(n=>fullyVisible(n,camera,area));
  assert(visible.length>0&&visible.length<40);
  const overview=overviewTransform(nodes,area);assert(overview.k<.5);
  for(const n of nodes){const tolerance={left:area.left-.001,right:area.right+.001,top:area.top-.001,bottom:area.bottom+.001};assert(fullyVisible(n,overview,tolerance));}
});
test('offscreen destination can be revealed at reading scale on desktop and touch viewport',()=>{
  const start=centeredTransform(layout.get('govtech4all'),area);
  const target=nodes.find(n=>!fullyVisible(n,start,area));assert(target);
  assert(fullyVisible(target,centeredTransform(target,area,.95),area));
  const mobile={left:20,right:350,top:110,bottom:360};
  const camera=centeredTransform(target,mobile,1);assert.equal(camera.k,1);assert(fullyVisible(target,camera,mobile));
});
test('filtering uses existing coordinates and deterministic rebuilds',()=>{
  const french=nodes.filter(n=>n.country==='FR');
  for(const n of french){assert.equal(n.x,layout.get(n.id).x);assert.equal(n.y,layout.get(n.id).y);}
  const again=buildLayout(data.organisations,data.relationships,d3);
  assert.deepEqual([...again.values()].map(n=>[n.id,n.x,n.y]),nodes.map(n=>[n.id,n.x,n.y]));
});
