// Shared, local search. No service, telemetry, model or paid search dependency.
export const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('nl').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
// Deliberately small domain vocabulary. These are search equivalents, not entity relations.
const groups = [
 ['digital identity','digitale identiteit','digital identities','digitale identiteiten'],
 ['artificial intelligence','kunstmatige intelligentie','ai'],
 ['generieke digitale infrastructuur','gdi'],
 ['common ground','commonground'],
 ['digital wallet','digitale wallet','identity wallet','identiteitswallet'],
 ['digital twin','digitale tweeling'],
 ['open source','opensource'],
 ['public procurement','publieke inkoop','overheidsinkoop'],
 ['data sharing','gegevensdeling','gegevens delen'],
 ['digital government','digitale overheid']
];
const canonical = text => {let value=' '+normalize(text)+' ';groups.forEach((group,i)=>{for(const phrase of group)value=value.split(' '+phrase+' ').join(' zzconcept'+i+' ');});return value.trim();};
function distance(a,b,max=1){
 if(Math.abs(a.length-b.length)>max)return max+1;
 let prev=Array.from({length:b.length+1},(_,i)=>i),older;
 for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++){row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]!==b[j-1]));if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])row[j]=Math.min(row[j],older[j-2]+1);}older=prev;prev=row;}return prev[b.length];
}
export function createSearchIndex(entities,themeLabels=new Map()){
 const byId=new Map(entities.map(e=>[e.id,e]));
 return new Map(entities.map(e=>{const names=[e.name,...(e.aliases||[])].map(normalize);const fields=[...names,e.description,e.govtech_basis,e.classification_note,e.relevance,e.city,e.kvk,...(e.collaboration_ids||[]).flatMap(id=>{const c=byId.get(id);return c?[c.name,...(c.aliases||[])]:[];}),...(e.themes||[]).map(t=>themeLabels.get(t)||t)];const raw=normalize(fields.join(' '));const text=canonical(fields.join(' '));return [e.id,{names,raw,tokens:[...new Set((raw+' '+text).split(' ').filter(Boolean))],text}];}));
}
export function searchMatch(entry,query){
 const raw=normalize(query);if(!raw)return {score:0,mode:'all'};
 const terms=canonical(query).split(' ');let score=0,mode='literal';
 for(const term of terms){
  if(entry.tokens.includes(term)){score+=100;continue;}
  if(term.length>=4&&!term.startsWith('zzconcept')&&entry.tokens.some(w=>w.startsWith(term))){score+=75;continue;}
  if(term.length>=4&&!term.startsWith('zzconcept')&&entry.tokens.some(w=>w.includes(term))){score+=60;continue;}
  // Acronyms and short words never receive fuzzy matching. One edit includes transposition.
  if(term.length>=5&&!term.startsWith('zzconcept')&&entry.tokens.some(w=>w.length>=5&&distance(term,w)<=1)){score+=35;mode='typo';continue;}
  return null;
 }
 const nameTokens=(entry.names.join(' ')+' '+canonical(entry.names.join(' '))).split(' ');
 for(const term of terms){if(nameTokens.includes(term))score+=40;else if(term.length>=4&&nameTokens.some(w=>w.startsWith(term)))score+=25;else if(term.length>=5&&!term.startsWith('zzconcept')&&nameTokens.some(w=>w.length>=5&&distance(term,w)<=1))score+=10;}
 if(entry.names.includes(raw))score+=10000;
 else if(entry.names.some(n=>n.startsWith(raw)))score+=2000;
 else if(entry.names.some(n=>n.includes(raw)))score+=1000;
 if(mode!=='typo'&&canonical(query)!==raw&&!raw.split(' ').every(t=>entry.raw.includes(t)))mode='synonym';
 return {score,mode};
}
export function searchSuggestions(entities,index,query,limit=3){
 const terms=normalize(query).split(' ').filter(Boolean);if(!terms.length)return [];
 return entities.map(e=>{const words=normalize(e.name).split(' ');const score=terms.reduce((sum,t)=>sum+(words.some(w=>w===t)?5:t.length>=4&&words.some(w=>w.startsWith(t)||t.startsWith(w)&&w.length>=4||distance(t,w,2)<=2)?2:0),0);return {name:e.name,score};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'nl')).slice(0,limit).map(x=>x.name);
}
