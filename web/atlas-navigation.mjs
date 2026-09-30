import {scopeFor,inScope} from './geography.mjs';
// Carry the discovery selection back from the independently filtered atlas.
export function discoveryReturn(value){
  if(typeof value!=='string'||value.length>6000||!value.startsWith('/')||value.startsWith('//')||value.includes('\\'))return '/';
  try{const u=new URL(value,'https://local.invalid');return u.origin==='https://local.invalid'&&['/','/index.html'].includes(u.pathname)?u.pathname+u.search:'/';}catch{return '/';}
}
export function mapURL({scope='all',returnTo='/',entity=null}={}){
  let area=['all','nl','zh','eu','ca'].includes(scope)?scope:'nl';
  if(entity&&entity.entity_type!=='innovation'&&((area==='all'&&entity.country)||!inScope(entity,area)))area=scopeFor(entity);
  const p=new URLSearchParams({scope:area,view:'map',return:discoveryReturn(returnTo)});
  if(entity&&entity.entity_type!=='innovation')p.set('org',entity.id);
  return '/atlas.html?'+p.toString();
}
