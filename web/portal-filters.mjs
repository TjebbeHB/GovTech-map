import {COLLECTIONS,collectionIds} from './collections.mjs';
import {createSearchIndex,searchMatch} from './search.mjs';
import {inScope} from './geography.mjs';
export const TYPES={innovation:'Oplossingen',organisation:'Organisaties',collaboration:'Samenwerkingen'};
export const ACTORS={market:'Markt',research:'Kennis & onderzoek',ngo:'NGO & maatschappij',government:'Overheid'};
export function readState(search, catalogue){
  const p=new URLSearchParams(search), valid=(key,allowed)=>[...new Set((p.get(key)||'').split(',').filter(v=>allowed.includes(v)))];
  return {collection:Object.hasOwn(COLLECTIONS,p.get('collection'))?p.get('collection'):'',q:(p.get('q')||'').slice(0,300),themes:valid('themes',catalogue.themes.map(t=>t.id)),actors:valid('actors',Object.keys(ACTORS)),types:valid('types',Object.keys(TYPES)),collaborations:valid('collaborations',catalogue.entities.filter(e=>e.entity_type==='collaboration').map(e=>e.id)),scope:['all','nl','zh','eu','ca'].includes(p.get('scope'))?p.get('scope'):'all',country:catalogue.entities.some(e=>e.country&&e.country===p.get('country'))?p.get('country'):'',sort:['collaborations','az','solutions','relevance'].includes(p.get('sort'))?p.get('sort'):'relevance',view:p.get('view')==='grouped'?'grouped':'cards',entity:catalogue.entities.some(e=>e.id===p.get('entity'))?p.get('entity'):'',embed:p.get('embed')==='1'};
}
export function stateQuery(s){const p=new URLSearchParams();for(const k of ['collection','q','themes','actors','types','collaborations','scope','country','sort','view','entity','embed']){let v=s[k];if(Array.isArray(v))v=[...v].sort().join(',');if(k==='embed')v=v?'1':'';if(v&&!((k==='scope'&&v==='all')||(k==='sort'&&v==='relevance')||(k==='view'&&v==='cards')))p.set(k,v);}return p.toString();}
export function filterEntities(catalogue,s){
  const byId=new Map(catalogue.entities.map(e=>[e.id,e])), themes=new Map(catalogue.themes.map(t=>[t.id,t.label]));
  const allowed=new Set();for(const id of s.collaborations){const c=byId.get(id);if(c){allowed.add(id);[...(c.organisation_ids||[]),...(c.innovation_ids||[])].forEach(x=>allowed.add(x));}}
  const index=createSearchIndex(catalogue.entities,themes),scores=new Map();
  const collection=s.collection?collectionIds(catalogue,s.collection):null;
  const result=catalogue.entities.filter(e=>{
    if(collection&&!collection.has(e.id))return false;
    if(s.types.length&&!s.types.includes(e.entity_type))return false;
    if(s.themes.length&&!s.themes.some(t=>(e.themes||[]).includes(t)))return false;
    if(s.collaborations.length&&!allowed.has(e.id))return false;
    if(s.actors.length){const actors=e.entity_type==='organisation'?(e.actor_types||[]):(e.organisation_ids||[]).flatMap(id=>byId.get(id)?.actor_types||[]);if(!actors.some(a=>s.actors.includes(a)))return false;}
    if(s.country&&e.country!==s.country)return false;
    if(!inScope(e,s.scope))return false;
    const match=searchMatch(index.get(e.id),s.q);if(match)scores.set(e.id,match.score);return !!match;
  });
  const collator=new Intl.Collator('nl',{sensitivity:'base'}), order={innovation:0,collaboration:1,organisation:2};
  return result.sort((a,b)=>(s.sort==='relevance'&&s.q.trim()?(scores.get(b.id)-scores.get(a.id)):0)||(s.sort==='solutions'||s.sort==='relevance'?(order[a.entity_type]-order[b.entity_type]):s.sort==='collaborations'?((b.collaboration_ids||[]).length-(a.collaboration_ids||[]).length):0)||collator.compare(a.name,b.name));
}
