import {createSearchIndex,searchMatch,searchSuggestions} from './search.mjs';
import {inScope,scopeFor,EUROPE} from './geography.mjs';
import {ACTORS as PORTAL_ACTORS} from './portal-filters.mjs';
import {discoveryReturn} from './atlas-navigation.mjs';
import {buildLayout,fullyVisible,screenBox,centeredTransform,overviewTransform} from './network-layout.mjs';
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TYPES = {company:'Techbedrijf',government:'Overheid',hub:'Hub',knowledge:'Kennis',support:'Ondersteuning',bigtech:'Big Tech'};
const COLORS = {company:'#79d3ac',government:'#f4a387',hub:'#c3ed83',knowledge:'#97c4de',support:'#e4cb83',bigtech:'#d4acce'};
const COUNTRY_NAMES={CA:'Canada',NL:'Nederland',PT:'Portugal',ES:'Spanje',FR:'Frankrijk',DE:'Duitsland',GR:'Griekenland',SE:'Zweden',BE:'België',GB:'Verenigd Koninkrijk',EU:'Europees programma',unknown:'Land niet vastgesteld'};
const REL = {collaboration:'Samenwerking',delivery:'Geleverde oplossing',procurement:'Aanbesteding',programme:'Programmarelatie',event:'Evenement',membership:'Community',historical:'Historische case'};
const isHistoricalEdge = e => e.kind==='historical'||/historical/.test(e.status||'')||['completed_phase','reported_completed'].includes(e.status);
const STATUS = {researched:'Brononderzoek',catalogue:'EU-catalogus',historical:'PUBLIC 2021 · historisch',register:'KvK 2025 · registratie'};
const statusLabel=o=>o.status==='historical'&&o.atlas_origin==='managed_public_projection'?'Afgerond / historisch':STATUS[o.status];
const PRECISION = {address:'BAG-adres',address_snapshot:'Adres uit 2025',postal:'Postadres',postcode:'Postcodegebied',city:'Stadniveau',hub:'Hubreferentie'};
const params = new URLSearchParams(location.search);
const returnToDiscovery=discoveryReturn(params.get('return'));
$('#discovery-return').href=returnToDiscovery;
$('.masthead .brand').href=returnToDiscovery;
const state = {scope:['all','tht','hague','nl','zh','eu','ca'].includes(params.get('scope'))?params.get('scope'):'nl',view:['network','map','directory'].includes(params.get('view'))?params.get('view'):'map',q:params.get('q')||'',kind:params.get('kind')||'',theme:params.get('theme')||'',country:params.get('country')||'',community:params.get('community')!=='0',historical:params.get('historical')!=='0',selected:params.get('org'),edge:params.get('edge')};
let searchIndex, data, byId, sources, thtIds, visible=[], edges=[], map, markers, graph, zoom, group, graphNodes, graphEdges, points=[], tileFailures=0;
let loadedFromCache=false;
let graphKey='';
let worldLayout,graphCamera=null,graphSize=null,graphCameraTarget=null;
// Geographic filters use country/province provenance, never inferred bounding boxes.
const AREAS={all:{name:'Alle landen',bounds:[[-50,-170],[78,160]]},ca:{name:'Canada',bounds:[[41,-141],[84,-52]]},nl:{name:'Nederland',bounds:[[50.7,3.2],[53.6,7.3]]},zh:{name:'Zuid-Holland',bounds:[[51.65,3.8],[52.35,5.15]]},eu:{name:'Europa',bounds:[[34,-13],[71,34]]},tht:{name:'The Hague Tech',bounds:[[52.05,4.29],[52.10,4.36]]},hague:{name:'Den Haag',bounds:[[52.02,4.2],[52.14,4.43]]}};
let mapArea=null;
function areaKey(){return state.scope+'|'+(state.scope==='eu'?state.country:'');}
function countryName(code){return COUNTRY_NAMES[code]||code;}
function fitArea(fullCountry=false){
  if(!map)return;
  mapArea=areaKey();map.invalidateSize();
  const focusLocations=!fullCountry&&(state.scope==='ca'||(['eu','all'].includes(state.scope)&&state.country));
  const pts=focusLocations?visible.filter(o=>o.location?.lat).map(o=>[o.location.lat,o.location.lon]):[];
  // Canada's sourced locations currently cluster in the southeast. Frame the
  // actual evidence by default; the whole-country button retains the Arctic.
  const padding=state.scope==='ca'&&pts.length?{paddingTopLeft:[60,75],paddingBottomRight:[60,85]}:{padding:[44,44]};
  map.fitBounds(pts.length?pts:AREAS[state.scope].bounds,{...padding,animate:false,maxZoom:pts.length?(state.scope==='ca'?6:7):19});
}

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function sourceHTML(ids, page) {
  return ids.map(id=>{
    const s=sources.get(id); if(!s)return '';
    const url=s.url ? s.url+(page&&id==='public-2021'?'#page='+page:'') : null;
    return `<div class="evidence">${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>`:`<strong>${esc(s.title)}</strong>`}<div class="evidence-meta">${esc(s.publisher)} · ${esc(s.date||'Datum niet vermeld')}<br>Geraadpleegd ${esc(s.checked)}${page&&id==='public-2021'?' · p. '+page:''}</div>${s.note?`<p>${esc(s.note)}</p>`:''}</div>`;
  }).join('');
}

function syncURL() {
  const p=new URLSearchParams();
  if(returnToDiscovery!=='/')p.set('return',returnToDiscovery);
  for(const key of ['scope','view','q','kind','theme','country']) if(state[key])p.set(key,state[key]);
  if(!state.community)p.set('community','0');
  if(!state.historical)p.set('historical','0');
  if(state.selected)p.set('org',state.selected);
  if(state.edge)p.set('edge',state.edge);
  history.replaceState(null,'','?'+p.toString());
}

function filtered() {
  const scores=new Map();
  visible=data.organisations.filter(o=>{
    if(state.scope==='tht'&&!thtIds.has(o.id))return false;
    if(state.scope==='hague'&&o.city!=='Den Haag')return false;
    if(!inScope(o,state.scope))return false;
    if(['eu','all','ca'].includes(state.scope)&&state.country&&(state.country==='unknown'?!!o.country:o.country!==state.country))return false;
    if(!state.historical&&o.status==='historical')return false;
    if(state.kind&&state.kind!==o.kind)return false;
    if(state.theme&&!o.themes.includes(state.theme))return false;
    const match=searchMatch(searchIndex.get(o.id),state.q);if(match)scores.set(o.id,match.score);return !!match;
  });
  if(state.q.trim())visible.sort((a,b)=>scores.get(b.id)-scores.get(a.id)||a.name.localeCompare(b.name,'nl'));
  const ids=new Set(visible.map(o=>o.id));
  edges=data.relationships.filter(e=>ids.has(e.source)&&ids.has(e.target)&&(state.community||e.kind!=='membership')&&(state.historical||!isHistoricalEdge(e)));
  if(state.selected&&!ids.has(state.selected))state.selected=null;
  if(state.edge&&!edges.some(e=>e.id===state.edge))state.edge=null;
}

function render() {
  filtered();
  document.body.dataset.view=state.view;
  $('#map-fit').textContent=state.scope==='ca'?'Locaties in beeld':'Gebied in beeld';
  $('#map-whole-country').hidden=state.scope!=='ca';
  $('#country').hidden=!['eu','all','ca'].includes(state.scope);
  for(const option of $('#country').options)option.hidden=!!option.value&&option.value!=='unknown'&&!inScope({country:option.value},state.scope);
  $('#stat-orgs').textContent=visible.length;
  $('#stat-relations').textContent=edges.filter(e=>e.kind!=='membership').length;
  $('#stat-locations').textContent=visible.filter(o=>o.location?.lat).length;
  $('#result-label').textContent=`${visible.length} organisaties · ${edges.length} lijnen`;
  $('#graph-stamp').innerHTML=esc(['eu','all','ca'].includes(state.scope)&&state.country?countryName(state.country):AREAS[state.scope].name).toLocaleUpperCase('nl')+'<br><span>RELATIES · GEEN KAARTPOSITIES</span>';
  $('#graph-title').textContent=state.scope==='tht'?'Dichtbij begint het.':state.scope==='hague'?'Den Haag, verbonden.':state.scope==='ca'?'Canada, verbonden.':state.scope==='all'?'Publieke innovatie, verbonden.':state.scope==='eu'?'Europa, verbonden.':state.scope==='zh'?'Zuid-Holland in beeld.':'Een land vol mogelijkheden.';
  $('#empty').hidden=visible.length>0;
  const suggestions=visible.length?[]:searchSuggestions(data.organisations.filter(o=>inScope(o,state.scope)&&(!state.country||o.country===state.country)&&(!state.kind||o.kind===state.kind)&&(!state.theme||o.themes.includes(state.theme))&&(state.historical||o.status!=='historical')),searchIndex,state.q);
  $('#atlas-search-suggestions').innerHTML=suggestions.map(name=>`<button class="text-button" data-search-suggestion="${esc(name)}">Probeer ${esc(name)}</button>`).join('');
  $('#atlas-search-feedback').hidden=visible.length>0||!state.q;

  $$('.tabs button').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.view===state.view));b.tabIndex=b.dataset.view===state.view?0:-1;});
  for(const v of ['network','map','directory'])$('#'+v+'-view').hidden=v!==state.view;
  $('#canvas-note').textContent=state.view==='network'?'Sleep voor organisaties buiten beeld. Leesbaar = leesafstand; Overzicht = hele selectie. Posities zijn niet geografisch. Stippellijnen = community; oranje = aanbesteding. Geen lijn betekent: geen relatie vastgelegd.':state.view==='map'?'Meerdere organisaties op hetzelfde punt worden gegroepeerd. Een stad-, postcode- of hubpunt is geen exact bedrijfsadres.':'De selectie bevat brononderzoek en catalogusvermeldingen. De status staat per organisatie vermeld.';
  if(state.view==='network'){
    const key=visible.map(o=>o.id).join('|')+'//'+edges.map(e=>e.id).join('|');
    if(key!==graphKey||!group){drawGraph();graphKey=key;}else highlight();
  }
  if(state.view==='map')drawMap();
  drawDirectory(); drawDetail(); syncURL();
}

function clearFilters() {
  Object.assign(state,{q:'',kind:'',theme:'',country:'',community:true,historical:true,selected:null,edge:null});
  controls();render();
}

function selectOrg(id, focus=true) {
  if(!byId.has(id))return;
  if(!visible.some(o=>o.id===id)){
    Object.assign(state,{q:'',kind:'',theme:'',country:'',historical:true});
    if(state.scope==='tht'&&!thtIds.has(id))state.scope='nl';
    if(state.scope==='hague'&&byId.get(id).city!=='Den Haag')state.scope='nl';
    if(state.scope==='zh'&&byId.get(id).province!=='Zuid-Holland')state.scope=byId.get(id).country&&byId.get(id).country!=='NL'?'eu':'nl';
    if(state.scope==='nl'&&byId.get(id).country!=='NL')state.scope='eu';
    if(!inScope(byId.get(id),state.scope))state.scope=scopeFor(byId.get(id));
    controls();filtered();
  }
  state.selected=id;state.edge=null;
  render();
  if(state.view==='network')focusGraphNode(id);
  if(focus){
    $('#detail').focus({preventScroll:true});
    if(innerWidth<=850)$('#detail').scrollIntoView({behavior:reduceMotion?'instant':'smooth',block:'start'});
  }
}

function selectEdge(id, focus=true) {
  const e=data.relationships.find(e=>e.id===id); if(!e)return;
  state.edge=id;state.selected=null;
  drawDetail(); highlight();syncURL();
  if(focus){$('#detail').focus({preventScroll:true});if(innerWidth<=850)$('#detail').scrollIntoView({behavior:reduceMotion?'instant':'smooth'});}
}

function drawDetail() {
  const detail=$('#detail');
  const o=byId.get(state.selected);
  const e=data.relationships.find(e=>e.id===state.edge);
  detail.classList.toggle('welcome',!o&&!e);
  document.body.classList.toggle('has-detail',!!o||!!e);
  if(e){
    detail.innerHTML=`<button class="close-detail" data-action="close" aria-label="Sluit verbinding">×</button><p class="eyebrow">VAN VERBINDING NAAR BEWIJS</p><span class="rel-tag ${e.kind}">${REL[e.kind]}</span><h2 style="margin-top:15px">${esc(e.label)}</h2><div class="relation-title"><button data-org="${e.source}">${esc(byId.get(e.source).name)}</button><span>↔</span><button data-org="${e.target}">${esc(byId.get(e.target).name)}</button></div><p>${esc(e.summary)}</p><p class="data-note">${esc(e.caution)}</p><dl><dt>Bron-/casedatum</dt><dd>${esc(e.date||e.period||'Niet vermeld')}</dd>${e.status?`<dt>Status bronclaim</dt><dd>${esc({listed_current:'Actueel vermeld',completed_phase:'Afgeronde pilotfase',reported_completed:'Afgerond volgens bron',historical_programme:'Historisch programma',historical:'Afgerond / historisch',planned:'Aangekondigd / gepland',completed_historical:'Afgerond / historisch',current_organisational_role:'Actuele organisatierol',documented_historical:'Gedocumenteerd / historisch',documented_historical_role:'Historische organisatierol',documented_programme_role:'Gedocumenteerde programmarol',historical_pilot:'Historische pilot',started_at_source_date:'Gestart op brondatum',supplier_case_historical:'Historische leverancierscase'}[e.status]||e.status)}</dd>`:''}<dt>Relatietype</dt><dd>${REL[e.kind]}</dd></dl><h3 class="section-label">BEWIJS & HERKOMST <span>${e.source_ids.length} bronnen</span></h3>${sourceHTML(e.source_ids,e.report_page)}`;
    return;
  }
  if(o){
    const links=data.relationships.filter(e=>(e.source===o.id||e.target===o.id)&&(state.community||e.kind!=='membership')&&(state.historical||!isHistoricalEdge(e))).sort((a,b)=>(a.kind==='membership')-(b.kind==='membership'));
    const location=o.location;
    const profileQuery=new URLSearchParams(returnToDiscovery.split('?')[1]||'');profileQuery.set('entity',o.id);
    detail.innerHTML=`<button class="close-detail" data-action="close" aria-label="Sluit organisatie">×</button><div class="entity-badge" style="background:${COLORS[o.kind]}">${esc(initials(o.name))}</div><div class="detail-type"><i class="dot ${o.kind}"></i>${o.entity_type==='collaboration'?'Samenwerking':TYPES[o.kind]} · ${esc(o.city)}${o.country?' · '+esc(countryName(o.country)):''}</div><h2>${esc(o.name)}</h2>${o.actor_types?.length?`<p class="location-note">${esc(o.actor_types.map(a=>PORTAL_ACTORS[a]).filter(Boolean).join(' / '))}</p>`:''}<a class="discovery-profile-link" href="/?${esc(profileQuery.toString())}">Bekijk profiel en oplossingen ↗</a><p ${o.description_language?'lang="en"':''}>${esc(o.description)}</p><div class="chips">${o.themes.map(t=>`<span class="chip">${esc(t)}</span>`).join('')}</div><p class="data-note">${statusLabel(o)}${o.tht?' · Vermeld bij THT; geen actuele huurderscontrole.':''}${o.source_status?' · Bronstatus: '+esc(o.source_status)+' (niet herbevestigd)':''}</p>${o.website?`<a class="website" href="${esc(o.website)}" target="_blank" rel="noopener noreferrer">Website organisatie <span>↗</span></a>`:''}<button class="inline-link network-jump" data-network-org="${o.id}">Toon in netwerk ↗</button><h3 class="section-label">BETEKENIS VOOR GOVTECH</h3><p>${esc(o.relevance)}</p>${['collaboration','programme','organisational_unit','public_unit','network','community'].includes(o.entity_type)?`<p class="location-note">${esc(['collaboration','programme'].includes(o.entity_type)?'Programma of samenwerking; geen zelfstandige rechtspersoon aangenomen.':['organisational_unit','public_unit'].includes(o.entity_type)?'Onderdeel van een organisatie.':'Netwerk of community; geen zelfstandige organisatie-identiteit aangenomen.')}</p>`:''}${o.prominence?`<p class="location-note">${esc(o.prominence)}</p>`:''}${o.govtech_basis?`<p class="location-note">${esc(o.govtech_basis)}</p>`:''}<dl><dt>KvK</dt><dd>${esc(o.kvk||'Niet bevestigd')}</dd><dt>Teamgrootte</dt><dd>${esc(o.staff||'Niet vastgesteld')}${o.staff?'<br>(EU-catalogus, '+esc(o.source_updated||'datum onbekend')+')':''}</dd>${o.catalogue_id?`<dt>EU-bron-ID</dt><dd>${esc(o.catalogue_id)}</dd>`:''}</dl><h3 class="section-label">LOCATIE</h3>${location?`<p>${esc(location.label||location.city)}${location.postcode&&!location.label?' · '+esc(location.postcode):''}</p><p class="location-note"><strong>${PRECISION[location.precision]||esc(location.precision)}</strong> · ${esc(location.note||'Adresbron en geometrie afzonderlijk vastgelegd.')}</p>${location.lat?`<button class="inline-link" data-map-org="${o.id}">Toon op kaart ↗</button>`:'<p class="location-note">Geen betrouwbaar kaartpunt beschikbaar.</p>'}<details><summary class="location-note">Locatiebronnen</summary>${sourceHTML(location.source_ids)}${location.coordinate_source?`<a class="location-note" href="${esc(location.coordinate_source)}" target="_blank" rel="noopener noreferrer">Stadscoördinaten bekijken ↗</a>`:''}${location.query?`<a class="location-note" href="${esc(location.query)}" target="_blank" rel="noopener noreferrer">PDOK-match bekijken ↗</a>`:''}</details>`:'<p>Locatie nog niet vastgesteld. Niet op de kaart gezet.</p>'}${o.kvk_candidates?.length&&!o.kvk?'<p class="location-note">Er is een gelijknamige KvK-kandidaat, maar onvoldoende identiteitsbewijs om het nummer en adres te koppelen.</p>':''}<h3 class="section-label">VASTGELEGDE VERBINDINGEN <span>${links.length}</span></h3>${links.length?links.map(e=>`<button class="rel-card" data-edge="${e.id}"><span class="rel-tag ${e.kind}">${REL[e.kind]}</span><strong>${esc(byId.get(e.source===o.id?e.target:e.source).name)} ↗</strong><small>${esc(e.label)} · ${esc(e.date||'Datum niet vermeld')}${isHistoricalEdge(e)?' · Historisch':''}</small></button>`).join(''):'<p>Nog geen onderbouwde relatie opgenomen. Dit betekent niet dat er geen samenwerking bestaat.</p>'}<h3 class="section-label">PROFIELBRONNEN</h3>${sourceHTML(o.source_ids,o.report_page)}`;
    return;
  }
  detail.innerHTML=`<div><p class="eyebrow">WELKOM IN HET ECOSYSTEEM</p><h2>Ontmoet de<br>verbindingen.</h2><p class="welcome-copy">Achter elke innovatie staan organisaties die elkaar vinden. Ontdek wat hen verbindt, en waarop we dat baseren.</p><div class="welcome-note"><b>↗</b><p>Begin bij een verhaal, of kies een organisatie in het netwerk. Elke verbinding brengt je naar de oorspronkelijke bron.</p></div></div><div><h3 class="section-label">DRIE VERHALEN OM TE ONTDEKKEN</h3>${[
    ['appsignal--nexyz--collaboration','01','Van buren naar partners','AppSignal × NexyZ','Een ontmoeting bij THT werd financieringsadvies.'],
    ['ubiops--sscict--procurement','02','AI voor de Rijksoverheid','UbiOps × SSC-ICT','Van een TenderNed-aankondiging naar het bewijs.'],
    ['prospero--hpm--delivery','03','Software van de buren','Prospero × Holland Park Media','Planningssoftware die binnen de community wordt gebruikt.']
  ].map(([id,no,title,pair,text])=>`<button class="story" data-edge="${id}"><span class="story-top">${no} <span>${esc(pair)}</span><span class="story-arrow">↗</span></span><h3>${title}</h3><p>${text}</p></button>`).join('')}</div>`;
}

function initials(name){return name.replace(/[^\p{L}\p{N}\s]/gu,'').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();}

function drawDirectory(){
  $('#directory').innerHTML=visible.length?visible.map(o=>`<button class="directory-row ${o.id===state.selected?'selected':''}" data-org="${o.id}"><span class="initial" style="background:${COLORS[o.kind]}55">${esc(initials(o.name))}</span><span><strong>${esc(o.name)}</strong><p>${esc(o.city)} · ${esc(o.themes.slice(0,2).join(' / '))}</p><span class="type-name">${TYPES[o.kind]} · ${statusLabel(o)}</span></span><span>↗</span></button>`).join(''):'<p class="directory-empty">Geen organisaties voor deze selectie. Probeer een andere zoekterm of kies een ruimer gebied.</p>';
}

function drawGraph(){
  const d3=window.d3;
  if(!d3){$('#empty').hidden=false;$('#empty').textContent='Netwerk kon niet laden. Gebruik de organisatielijst.';return;}
  const pendingCamera=graphCameraTarget;
  graph?.interrupt();
  if(pendingCamera)graphCamera=pendingCamera;
  graph=d3.select('#network');graph.selectAll('*').remove();
  const width=Math.max(280,$('#network-view').clientWidth),height=$('#network-view').clientHeight||620;
  const previousSize=graphSize;graphSize={width,height};
  graph.attr('viewBox',`0 0 ${width} ${height}`);
  graph.append('title').text(`${visible.length} organisaties en ${edges.length} brononderbouwde lijnen. Sleep om organisaties buiten beeld te verkennen, of kies Overzicht.`);
  group=graph.append('g');
  const degree=new Map(visible.map(o=>[o.id,edges.filter(e=>e.source===o.id||e.target===o.id).length]));
  if(!worldLayout){
    const context=document.createElement('canvas').getContext('2d');
    context.font='14px '+getComputedStyle(document.body).fontFamily;
    worldLayout=buildLayout(data.organisations,data.relationships,d3,text=>context.measureText(text).width);
  }
  graphNodes=visible.map(o=>({...worldLayout.get(o.id)}));
  const nodesById=new Map(graphNodes.map(n=>[n.id,n]));
  graphEdges=edges.map(e=>({...e,source:nodesById.get(e.source),target:nodesById.get(e.target)}));
  const edgeGroup=group.append('g');
  const paths=edgeGroup.selectAll('path').data(graphEdges).join('path').attr('class','graph-edge')
    .attr('stroke-dasharray',d=>d.kind==='membership'?'3 6':isHistoricalEdge(d)?'8 5':null)
    .style('stroke',d=>d.kind==='procurement'?'#e6ab79':null);
  const hits=group.append('g').selectAll('path').data(graphEdges).join('path').attr('class','edge-hit')
    .attr('role','button').attr('tabindex',0).attr('aria-label',d=>`${byId.get(d.source.id).name} en ${byId.get(d.target.id).name}: ${d.label}`)
    .on('click',(ev,d)=>{ev.stopPropagation();selectEdge(d.id);})
    .on('keydown',(ev,d)=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();selectEdge(d.id);}});
  const node=group.append('g').selectAll('g').data(graphNodes).join('g').attr('class','graph-node').attr('role','button').attr('tabindex',0)
    .attr('aria-label',d=>`${d.name}, ${TYPES[d.kind]}, ${degree.get(d.id)} lijnen. Open profiel.`)
    .on('click',(ev,d)=>{ev.stopPropagation();selectOrg(d.id);})
    .on('keydown',(ev,d)=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();selectOrg(d.id);}})
    .on('focus',(ev,d)=>focusGraphNode(d.id));
  node.append('circle').attr('class','hit').attr('r',30);
  node.append('title').text(d=>`${d.name} · ${TYPES[d.kind]}`);
  node.append('circle').attr('class','node-ring').attr('r',d=>d.r+7);
  node.append('path').attr('class','node-shape').attr('d',d=>d3.symbol().type(d.kind==='government'?d3.symbolSquare:d.kind==='hub'?d3.symbolDiamond:d3.symbolCircle).size(Math.PI*d.r*d.r)())
    .attr('fill',d=>COLORS[d.kind]).attr('stroke','#143335').attr('stroke-width',3);
  node.append('text').attr('y',4).attr('text-anchor','middle').style('stroke','none').style('fill','#173c39').style('font-family','Grotesk').style('font-size',d=>d.r>18?'13px':'10px').text(d=>d.kind==='hub'?'+':degree.get(d.id)||'');
  node.append('text').attr('class','node-label').attr('text-anchor','middle')
    .each(function(d){d3.select(this).selectAll('tspan').data(d.labelLines).join('tspan').attr('x',0).attr('y',(_,i)=>d.r+24+i*18).text(line=>line);});
  node.filter(d=>degree.get(d.id)>5).append('text').attr('class','node-caption').attr('text-anchor','middle').attr('y',d=>d.r+26+d.labelLines.length*18).text(d=>`${degree.get(d.id)} verbindingen`);
  function linkPath(d){
    const paired=graphEdges.filter(e=>[e.source.id,e.target.id].sort().join('|')===[d.source.id,d.target.id].sort().join('|'));
    const offset=(paired.indexOf(d)-(paired.length-1)/2)*23;
    const dx=d.target.x-d.source.x,dy=d.target.y-d.source.y,length=Math.hypot(dx,dy)||1;
    return `M${d.source.x},${d.source.y} Q${(d.source.x+d.target.x)/2-dy/length*offset},${(d.source.y+d.target.y)/2+dx/length*offset} ${d.target.x},${d.target.y}`;
  }
  function position(){paths.attr('d',linkPath);hits.attr('d',linkPath);node.attr('transform',d=>`translate(${d.x},${d.y})`);}
  node.call(d3.drag().clickDistance(6).on('drag',(ev,d)=>{d.x=ev.x;d.y=ev.y;Object.assign(worldLayout.get(d.id),{x:d.x,y:d.y});position();}));
  position();
  zoom=d3.zoom().scaleExtent([.025,4]).on('zoom',ev=>{
    graphCamera=ev.transform;group.attr('transform',ev.transform);
    $('#graph-zoom').textContent=Math.round(ev.transform.k*100)+'%';
  });
  graph.call(zoom).on('dblclick.zoom',null).on('keydown.pan',ev=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key))return;
    ev.preventDefault();
    const dx=ev.key==='ArrowLeft'?100:ev.key==='ArrowRight'?-100:0;
    const dy=ev.key==='ArrowUp'?100:ev.key==='ArrowDown'?-100:0;
    graph.interrupt().call(zoom.translateBy,dx/graphCamera.k,dy/graphCamera.k);
  });
  if(!graphCamera)readableGraph(false);
  else{
    const camera={...graphCamera};
    if(previousSize){camera.x+=(width-previousSize.width)/2;camera.y+=(height-previousSize.height)/2;}
    moveGraphCamera(camera,false);
    // Keep the camera when a filter still has content in view. Reveal a result
    // only when the existing camera would otherwise show an empty world.
    const area=graphArea();
    const inView=graphNodes.some(n=>{const b=screenBox(n,graphCamera);return b.right>area.left&&b.left<area.right&&b.bottom>area.top&&b.top<area.bottom;});
    if(graphNodes.length&&!inView)readableGraph(false);
  }
  highlight();
}

function graphArea(){
  const {width,height}=graphSize;
  const view=$('#network-view').getBoundingClientRect(),detail=$('#detail').getBoundingClientRect();
  const overlay=!$('#detail').classList.contains('welcome')&&detail.left>view.left&&detail.left<view.right&&detail.top<view.bottom&&detail.bottom>view.top;
  const right=overlay?detail.left-view.left:width;
  return {left:30,right:Math.max(220,right-30),top:110,bottom:Math.max(260,height-85)};
}
function graphAnchor(){
  return graphNodes?.find(n=>n.id===state.selected)||
    graphNodes?.find(n=>n.id===(state.scope==='eu'&&!state.country?'govtech4all':''))||
    [...(graphNodes||[])].sort((a,b)=>b.degree-a.degree||a.id.localeCompare(b.id))[0];
}
function moveGraphCamera(camera,animate=true){
  if(!graph||!zoom)return;
  const t=window.d3.zoomIdentity.translate(camera.x,camera.y).scale(camera.k);
  graph.interrupt();
  if(animate&&!reduceMotion){
    graphCameraTarget=t;
    graph.transition().duration(420).call(zoom.transform,t).on('end.camera interrupt.camera',()=>{graphCameraTarget=null;});
  }else{graphCameraTarget=null;graph.call(zoom.transform,t);}
}
function focusGraphNode(id){
  if(state.view!=='network'||!graphCamera)return;
  const node=graphNodes?.find(n=>n.id===id);if(!node)return;
  if(graphCamera.k>=.85&&fullyVisible(node,graphCamera,graphArea()))return;
  moveGraphCamera(centeredTransform(node,graphArea(),Math.max(.95,graphCamera.k)));
}
function readableGraph(animate=true){
  const anchor=graphAnchor();if(anchor)moveGraphCamera(centeredTransform(anchor,graphArea(),1),animate);
  else moveGraphCamera({k:1,x:0,y:0},false);
}
function fitGraph(){
  if(graphNodes?.length)moveGraphCamera(overviewTransform(graphNodes,graphArea()));
}

function highlight(){
  if(!graph)return;
  const selected=state.selected, e=data.relationships.find(e=>e.id===state.edge);
  const near=new Set(selected?[selected]:e?[e.source,e.target]:[]);
  if(selected)edges.filter(e=>e.source===selected||e.target===selected).forEach(e=>{near.add(e.source);near.add(e.target);});
  graph.selectAll('.graph-node').classed('selected',d=>d.id===selected||!!e&&near.has(d.id)).classed('dimmed',d=>near.size>0&&!near.has(d.id));
  graph.selectAll('.graph-edge').classed('selected',d=>d.id===state.edge||!!selected&&(d.source.id===selected||d.target.id===selected)).classed('dimmed',d=>near.size>0&&(e?d.id!==e.id:d.source.id!==selected&&d.target.id!==selected));
}

function drawMap(){
  if(!window.L)return;
  if(!map){
    map=L.map('map',{zoomControl:true,zoomSnap:.25}).setView([52.071,4.323],13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'})
      .on('tileerror',()=>{tileFailures++;mapMessage();}).addTo(map);
    markers=L.layerGroup().addTo(map);
    L.control.scale({imperial:false}).addTo(map);
    map.on('zoomend',()=>{if(data&&state.view==='map')drawMap();});
  }
  markers.clearLayers();points=[];
  const groups=new Map();
  for(const o of visible){
    if(!$('#show-locations').checked||!o.location?.lat)continue;
    const projected=map.project([o.location.lat,o.location.lon],map.getZoom());
    const gridKey=map.getZoom()<13?`${Math.floor(projected.x/52)},${Math.floor(projected.y/52)}`:`${o.location.lat},${o.location.lon}`;
    const key=(o.country||'NL')+':'+gridKey;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);
  }
  for(const orgs of groups.values()){
    const l=orgs[0].location,point=[l.lat,l.lon];points.push(point);
    const el=document.createElement('div');
    const shared=orgs.every(o=>o.location.lat===l.lat&&o.location.lon===l.lon);
    const h=document.createElement('h3');h.textContent=orgs.length>1?`${orgs.length} organisaties ${shared?'bij dit referentiepunt':'in deze omgeving'}`:orgs[0].name;el.append(h);
    const p=document.createElement('p');p.textContent=shared?(l.label||l.city):'Zoom in voor afzonderlijke locaties. Cluster staat op een bestaand referentiepunt.';el.append(p);
    for(const o of orgs){const b=document.createElement('button');b.textContent=`${o.name} · ${o.city} · ${PRECISION[o.location.precision]}`;b.addEventListener('click',()=>selectOrg(o.id));el.append(b);}
    L.marker(point,{icon:L.divIcon({className:'cluster-pin'+(orgs.every(o=>o.kind!=='company'&&o.kind!=='bigtech')?' community-pin':''),html:String(orgs.length),iconSize:[44,44]}),title:orgs.map(o=>o.name).join(', '),keyboard:true}).addTo(markers).bindPopup(el);
  }
  map.invalidateSize();mapMessage();
  if(mapArea!==areaKey())fitArea();
}

function mapMessage(){
  const located=visible.filter(o=>o.location?.lat).length;
  $('#map-message').textContent=!navigator.onLine?'Offline: netwerk en lijst beschikbaar; kaartachtergrond vereist internet.':tileFailures?'Kaarttegels laden niet volledig. Locatiepunten blijven beschikbaar.':`${['eu','all','ca'].includes(state.scope)&&state.country?(state.country==='unknown'?'Land niet vastgesteld':countryName(state.country)):AREAS[state.scope].name} · ${visible.length} organisaties · ${located} met locatie${visible.length-located?' · '+(visible.length-located)+' zonder kaartpunt':''}.`;
}

function controls(){
  for(const key of ['scope','kind','theme','country'])$('#'+key).value=state[key];
  $('#search').value=state.q;
  $('#community').checked=state.community;$('#historical').checked=state.historical;
}

function download(content,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

function exportSelection(){
  const cell=v=>{let s=String(v??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const rows=[['id','naam','type','stad','themas','status','kvk','latitude','longitude','precisie','bronnen'],...visible.map(o=>[o.id,o.name,TYPES[o.kind],o.city,o.themes.join('; '),statusLabel(o),o.kvk,o.location?.lat,o.location?.lon,PRECISION[o.location?.precision]||'',o.source_ids.map(id=>sources.get(id)?.url||sources.get(id)?.title).join('; ')])];
  download('\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n'),'govtech-selectie.csv','text/csv;charset=utf-8');
}

function showMethod(){
  const located=data.organisations.filter(o=>o.location?.lat).length;
  $('#method-content').innerHTML=`<p>Deze editie bevat <strong>${data.organisations.length} organisaties</strong>, ${data.relationships.length} relaties en ${located} organisaties met een kaartpunt. De kaart combineert Nederlandse leveranciers, publieke afnemers, Europese samenwerkingsnetwerken en een eerste Canadese selectie. Canada heeft een eigen gebied; Alle landen toont ook verbindingen over continenten. Zoeken herkent accenten, leestekens, bekende afkortingen, een beperkte set Nederlandse/Engelse begrippen en één typefout in woorden van minimaal vijf letters. Exacte namen staan bovenaan; korte afkortingen worden niet met typefouten uitgebreid.</p><h3>Wat betekent een verbinding?</h3>${Object.entries(REL).map(([key,value])=>`<div class="method-row"><span class="rel-tag ${key}">${value}</span><span>${{collaboration:'Expliciet beschreven samenwerking, bijvoorbeeld financieringsadvies.',delivery:'Gepubliceerde klantcase. Kan door de leverancier zelf zijn geschreven.',procurement:'Een aankondiging is niet hetzelfde als een ondertekend of uitgevoerd contract.',programme:'Een genoemd organisatiepartnerschap, geen opdracht.',event:'Mede-organisatie of samenwerking rond een specifiek evenement.',membership:'Vermeld in dezelfde community. Niet als samenwerking geteld.',historical:'Een historische case of eerdere aankondiging; bekijk de bronperiode en latere ontwikkelingen.'}[key]}</span></div>`).join('')}<h3>Landelijke laag, met beperkingen</h3><p>De EU-atlas levert 67 bedrijven met Nederland als eerste landdekking en negen initiatieven. Twee initiatieven zijn samengevoegd met lokale profielen. Landdekking is geen bewijs van een Nederlands hoofdkantoor. De bron bevat ook zorg-, onderwijs- en klimaattechnologie. PUBLIC 2021 voegt 17 historische hubs en twee historische samenwerkingscases toe.</p><p>De 11.949 tech-gecodeerde KvK-kandidaten uit de vorige versie zijn bewaard, maar niet als bewezen GovTech-leveranciers gepubliceerd. Een unieke overeenkomst in naam en websitedomein is gebruikt voor een beperkte KvK-koppeling. Gelijknamige kandidaten zonder domeinbewijs zijn niet samengevoegd.</p><h3>Nieuwe bronselectie · september 2026</h3><p>Uit 192.345 KvK-rijen zijn met hoofd- en nevenactiviteiten 17.049 unieke rechtspersonen voorgeselecteerd. De historische SBI-2008-codes zijn behouden. Dit is een onderzoekslijst, geen GovTech-register. Een eerste bewuste selectie van 97 namen is getrieerd: 20 hebben onderzoeksprioriteit en 77 blijven uitgesteld. Voor 11 bedrijven is de publieke toepassing nader onderbouwd. Deze overlappen deels met het afzonderlijke landelijke leveranciersonderzoek.</p><p>Nieuwe bedrijfsprofielen vereisen een herkenbare technologie én een concrete publieke toepassing of een specifiek overheidsproduct. Europese profielen beschrijven aangetoonde programma- en pilotrollen. Gedeeld consortiumlidmaatschap wordt apart getoond van directe samenwerking; bezoeken zonder bewezen gastorganisatie leveren geen lijn op.</p><h3>Europese partners en bredere hubs</h3><p>Voor Portugal, Spanje, Frankrijk, Duitsland, Griekenland en Zweden zijn partners van de bestaande ingangen én aanvullende publieke innovatienetwerken onderzocht. Prominentie volgt uit publiek mandaat, bereik, programma’s of gepubliceerde omvang. Consortiumleden, incubators en deelnemers zijn niet onderling als een grootste-hub-ranglijst vergeleken. Programma’s en organisatieonderdelen zijn als zodanig benoemd. Afgeronde projecten blijven historisch zichtbaar; een bronclaim bewijst geen huidige opdracht.</p><h3>Geen schijnprecisie</h3><p>Adressen en postcodes worden gecontroleerd via PDOK/BAG. Communityleden kunnen op het gedeelde THT-referentiepunt staan; dat bewijst geen individueel kantoor. Stadpunten zijn alleen orientatie. De nieuwe Europese stadpunten gebruiken GeoNames met afzonderlijke bronnen voor de vestigingsstad en de coördinaten. Onbetrouwbare coördinaten uit de oude EU-atlas zijn niet overgenomen. Ontbrekende locaties blijven zichtbaar in de lijst.</p><h3>Gebruik op een publiek scherm</h3><p>Schermmodus vereenvoudigt de interface. Zoeken, netwerk en lijst werken op een touchscreen. Na een eerste online bezoek zijn deze op localhost/HTTPS offline beschikbaar. Kaarttegels worden niet vooraf gedownload. Op Android is HTTPS nodig voor installatie en offline caching; via een lokaal HTTP-adres werkt de browserweergave wel.</p><h3>Onderzoek, geen aanbeveling</h3><p>De selectie is geen keurmerk, actueel huurdersregister, volledige Nederlandse inventarisatie of bewijs van soevereiniteit. Eigendom, hosting, subverwerkers, open standaarden en contractuele exitvoorwaarden vragen apart onderzoek. Persoonlijke contactgegevens zijn niet overgenomen.</p><h3>Bronnen & verantwoording</h3><div class="source-list">${data.sources.map(s=>s.url?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.publisher)}: ${esc(s.title)} ↗</a>`:`<p>${esc(s.title)} (lokale bron, niet gepubliceerd)</p>`).join('')}</div>`;
  $('#about-dialog').showModal();
}

function connectivity(){
  $('#connection-status').textContent=!navigator.onLine?'Offline · laatst opgeslagen onderzoekseditie':loadedFromCache?'Opgeslagen onderzoekseditie · server niet bereikbaar':'Gepubliceerde onderzoekseditie · alleen lezen';
  if(map)mapMessage();
}

async function init(){
  try{
    const response=await fetch('/data/ecosystem.json',{cache:'no-cache',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('Database niet beschikbaar');
    loadedFromCache=response.headers.get('X-GovTech-Cache')==='offline';
    data=await response.json();
    try{localStorage.setItem('govtech-catalogue-v1',JSON.stringify(data));}catch{}
  }catch(error){
    try{data=JSON.parse(localStorage.getItem('govtech-catalogue-v1'));loadedFromCache=!!data;}catch{}
    if(!data){$('#result-label').textContent='Database niet beschikbaar';$('#detail').innerHTML='<div class="error-box"><h2>Geen verbinding</h2><p>De database kon niet worden geladen. Start de server en probeer opnieuw.</p><button data-action="reload">Opnieuw proberen</button></div>';return;}
  }
  byId=new Map(data.organisations.map(o=>[o.id,o]));sources=new Map(data.sources.map(s=>[s.id,s]));
  thtIds=new Set(data.organisations.filter(o=>o.tht).map(o=>o.id));
  data.relationships.forEach(e=>{if(byId.get(e.source)?.tht||byId.get(e.target)?.tht){thtIds.add(e.source);thtIds.add(e.target);}});
  searchIndex=createSearchIndex(data.organisations);
  $('#theme').innerHTML='<option value="">Alle thema\'s</option>'+[...new Set(data.organisations.flatMap(o=>o.themes))].sort().map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');
  $('#country').innerHTML='<option value="">Alle landen</option>'+[...new Set(data.organisations.map(o=>o.country).filter(c=>c))].sort((a,b)=>countryName(a).localeCompare(countryName(b),'nl')).map(c=>`<option value="${esc(c)}">${esc(countryName(c))}</option>`).join('')+'<option value="unknown">Land niet vastgesteld</option>';
  if(state.country&&state.country!=='unknown'&&!data.organisations.some(o=>o.country===state.country))state.country='';
  if(state.kind&&!TYPES[state.kind])state.kind='';
  if(state.theme&&!data.organisations.some(o=>o.themes.includes(state.theme)))state.theme='';
  await document.fonts.ready;
  controls();render();connectivity();
  if('serviceWorker' in navigator&&isSecureContext){navigator.serviceWorker.register('/sw.js').catch(()=>{});}
}

document.addEventListener('click',ev=>{
  const el=ev.target.closest('button,a'); if(!el)return;
  if(el.dataset.org)selectOrg(el.dataset.org);
  if(el.dataset.edge)selectEdge(el.dataset.edge);
  if(el.dataset.networkOrg){state.view='network';selectOrg(el.dataset.networkOrg,false);$('#network-view').scrollIntoView({behavior:reduceMotion?'instant':'smooth',block:'center'});}
  if(el.dataset.mapOrg){$('#show-locations').checked=true;state.view='map';render();const l=byId.get(el.dataset.mapOrg).location;if(l?.lat)map.setView([l.lat,l.lon],l.precision==='city'?12:16,{animate:!reduceMotion});$('#map-view').scrollIntoView({behavior:reduceMotion?'instant':'smooth',block:'center'});}
  if(el.dataset.action==='close'){state.selected=null;state.edge=null;drawDetail();highlight();syncURL();}
  if(el.dataset.action==='reload')location.reload();
  if(el.dataset.view){state.view=el.dataset.view;render();if(state.view==='network'&&state.selected)focusGraphNode(state.selected);}
});
$('.tabs').addEventListener('keydown',ev=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(ev.key))return;
  ev.preventDefault();const tabs=$$('.tabs button'),i=tabs.findIndex(t=>t===document.activeElement);
  const next=ev.key==='Home'?0:ev.key==='End'?2:(i+(ev.key==='ArrowRight'?1:2))%3;
  state.view=tabs[next].dataset.view;render();tabs[next].focus();
});
for(const key of ['scope','kind','theme','country'])$('#'+key).addEventListener('change',ev=>{state[key]=ev.target.value;if(key==='scope'){state.country='';$('#country').value='';}state.selected=null;state.edge=null;render();});
$('#atlas-search-suggestions').addEventListener('click',e=>{const b=e.target.closest('[data-search-suggestion]');if(b){state.q=b.dataset.searchSuggestion;controls();render();}});
let searchTimer;
$('#search').addEventListener('input',ev=>{state.q=ev.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(render,160);});
for(const key of ['community','historical'])$('#'+key).addEventListener('change',ev=>{state[key]=ev.target.checked;render();});
$('#reset').addEventListener('click',clearFilters);$('#empty-reset').addEventListener('click',clearFilters);
$('#zoom-in').addEventListener('click',()=>graph&&zoom&&graph.interrupt().call(zoom.scaleBy,1.35));
$('#zoom-out').addEventListener('click',()=>graph&&zoom&&graph.interrupt().call(zoom.scaleBy,1/1.35));
$('#fit').addEventListener('click',fitGraph);
$('#readable').addEventListener('click',()=>readableGraph());
$('#map-fit').addEventListener('click',()=>fitArea());
$('#map-whole-country').addEventListener('click',()=>fitArea(true));
$('#show-locations').addEventListener('change',()=>{if(state.view==='map')drawMap();});
$('#export-selection').addEventListener('click',exportSelection);
$('#export-full').addEventListener('click',ev=>{if(data){ev.preventDefault();download(JSON.stringify(data,null,2),'govtech-ecosysteem.json','application/json');}});
for(const id of ['about','method-link'])$('#'+id).addEventListener('click',()=>data&&showMethod());
$('#close-about').addEventListener('click',()=>$('#about-dialog').close());
$('#about-dialog').addEventListener('click',ev=>{if(ev.target===$('#about-dialog')){const r=ev.target.getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)ev.target.close();}});
$('#display-mode').addEventListener('click',()=>{
  const on=document.body.classList.toggle('display');
  $('#display-mode').innerHTML=on?'Schermmodus sluiten <span>×</span>':'Schermmodus <span>↗</span>';
  if(on)window.scrollTo({top:0});
  requestAnimationFrame(()=>{if(state.view==='network')drawGraph();if(map)map.invalidateSize();});
});
document.addEventListener('keydown',ev=>{
  if(ev.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!$('#about-dialog').open){ev.preventDefault();$('#search').focus();}
  if(ev.key==='Escape'&&document.body.classList.contains('display')&&!$('#about-dialog').open)$('#display-mode').click();
});
window.addEventListener('online',connectivity);window.addEventListener('offline',connectivity);
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(data&&state.view==='network')drawGraph();if(map)fitArea();},180);});
init();
