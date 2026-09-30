// Abstract world coordinates. Never scale node positions into a viewport.
export function wrapLabel(name, measure = text => text.length * 7.5, limit = 230) {
  const lines=[]; let line='';
  for (const word of name.split(/\s+/)) {
    if (line && measure(line+' '+word)>limit) { lines.push(line); line=word; }
    else line+=(line?' ':'')+word;
  }
  if(line)lines.push(line);
  return lines;
}

export function bounds(nodes) {
  if(!nodes.length)return {x:0,y:0,width:1,height:1};
  const x=Math.min(...nodes.map(n=>n.x-n.box.left)),y=Math.min(...nodes.map(n=>n.y-n.box.top));
  return {x,y,width:Math.max(...nodes.map(n=>n.x+n.box.right))-x,height:Math.max(...nodes.map(n=>n.y+n.box.bottom))-y};
}

// Asymmetric boxes include the full multiline label underneath each symbol.
// Used during settling and again afterwards, without a viewport clamp.
export function separateBoxes(nodes, iterations=1, velocity=false) {
  let moved=false;
  for(let step=0;step<iterations;step++){
    moved=false;
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
      const a=nodes[i],b=nodes[j];
      const ax=a.x+(velocity?a.vx:0),ay=a.y+(velocity?a.vy:0),bx=b.x+(velocity?b.vx:0),by=b.y+(velocity?b.vy:0);
      const left=ax+a.box.right-(bx-b.box.left),right=bx+b.box.right-(ax-a.box.left);
      const top=ay+a.box.bottom-(by-b.box.top),bottom=by+b.box.bottom-(ay-a.box.top);
      if(Math.min(left,right,top,bottom)<=0)continue;
      moved=true;
      const px=Math.min(left,right),py=Math.min(top,bottom);
      if(px<py){const delta=(left<right?-1:1)*(px+.2)/2;const key=velocity?'vx':'x';a[key]+=delta;b[key]-=delta;}
      else{const delta=(top<bottom?-1:1)*(py+.2)/2;const key=velocity?'vy':'y';a[key]+=delta;b[key]-=delta;}
    }
    if(!moved)break;
  }
  return moved;
}

export function buildLayout(organisations,relationships,d3,measure) {
  const adjacency=new Map(organisations.map(o=>[o.id,new Set()]));
  for(const e of relationships){adjacency.get(e.source)?.add(e.target);adjacency.get(e.target)?.add(e.source);}
  const nodes=organisations.map(o=>{
    const degree=relationships.filter(e=>e.source===o.id||e.target===o.id).length;
    const r=Math.min(25,10+Math.sqrt(degree)*3),labelLines=wrapLabel(o.name,measure);
    const half=Math.max(32,...labelLines.map(line=>(measure?measure(line):line.length*7.5)/2))+24;
    return {...o,r,degree,labelLines,box:{left:half,right:half,top:r+22,bottom:r+22+labelLines.length*18+(degree>5?18:0)+24},x:0,y:0};
  });
  const byId=new Map(nodes.map(n=>[n.id,n])),seen=new Set(),components=[];
  for(const n of nodes){
    if(seen.has(n.id))continue;
    const component=[],queue=[n.id];seen.add(n.id);
    for(let i=0;i<queue.length;i++){
      const id=queue[i];component.push(byId.get(id));
      for(const other of adjacency.get(id)||[])if(byId.has(other)&&!seen.has(other)){seen.add(other);queue.push(other);}
    }
    components.push(component);
  }
  const connected=components.filter(c=>c.length>1).sort((a,b)=>b.length-a.length||a[0].id.localeCompare(b[0].id));
  for(const component of connected){
    const ids=new Set(component.map(n=>n.id));
    const links=relationships.filter(e=>ids.has(e.source)&&ids.has(e.target)).map(e=>({...e}));
    // Deterministic spiral is merely a seed. Forces operate in spacious world units.
    component.forEach((n,i)=>{const radius=95*Math.sqrt(i);n.x=Math.cos(i*2.39996)*radius;n.y=Math.sin(i*2.39996)*radius;});
    const simulation=d3.forceSimulation(component).randomSource(d3.randomLcg(.42))
      .force('links',d3.forceLink(links).id(n=>n.id).distance(e=>330+Math.sqrt(Math.max(e.source.degree,e.target.degree))*25).strength(.25))
      .force('charge',d3.forceManyBody().strength(-1800).distanceMax(1300))
      .force('x',d3.forceX(0).strength(.012)).force('y',d3.forceY(0).strength(.012))
      .force('labels',()=>separateBoxes(component,1,true)).stop();
    for(let i=0;i<360;i++)simulation.tick();
    separateBoxes(component,120);
  }
  // Pack disconnected components with generous gutters; independent organisations
  // form a labelled grid alongside the networks, not an anonymous outer ring.
  const isolated=components.filter(c=>c.length===1).flat().sort((a,b)=>(a.country||'ZZ').localeCompare(b.country||'ZZ')||a.name.localeCompare(b.name));
  const shelfWidth=Math.max(2200,Math.sqrt(connected.reduce((sum,c)=>{const b=bounds(c);return sum+(b.width+220)*(b.height+220);},0))*1.4);
  let x=0,y=0,rowHeight=0;
  for(const component of connected){
    const b=bounds(component);
    if(x && x+b.width>shelfWidth){x=0;y+=rowHeight+220;rowHeight=0;}
    for(const n of component){n.x+=x-b.x;n.y+=y-b.y;}
    x+=b.width+220;rowHeight=Math.max(rowHeight,b.height);
  }
  const isolatedY=connected.length?y+rowHeight+260:0;
  const cellWidth=Math.max(320,...isolated.map(n=>n.box.left+n.box.right+70));
  const cellHeight=Math.max(190,...isolated.map(n=>n.box.top+n.box.bottom+50));
  const columns=Math.max(1,Math.ceil(Math.sqrt(isolated.length*cellHeight/cellWidth*1.7)));
  isolated.forEach((n,i)=>{n.x=(i%columns)*cellWidth+n.box.left;n.y=isolatedY+Math.floor(i/columns)*cellHeight+n.box.top;});
  return byId;
}

export function screenBox(node,transform) {
  return {left:(node.x-node.box.left)*transform.k+transform.x,right:(node.x+node.box.right)*transform.k+transform.x,
    top:(node.y-node.box.top)*transform.k+transform.y,bottom:(node.y+node.box.bottom)*transform.k+transform.y};
}
export function fullyVisible(node,transform,area) {
  const b=screenBox(node,transform);
  return b.left>=area.left&&b.right<=area.right&&b.top>=area.top&&b.bottom<=area.bottom;
}
export function centeredTransform(node,area,k=1) {
  const cx=node.x+(node.box.right-node.box.left)/2,cy=node.y+(node.box.bottom-node.box.top)/2;
  return {k,x:(area.left+area.right)/2-cx*k,y:(area.top+area.bottom)/2-cy*k};
}
export function overviewTransform(nodes,area) {
  const b=bounds(nodes),k=Math.min(1,(area.right-area.left)/b.width,(area.bottom-area.top)/b.height);
  return {k,x:(area.left+area.right)/2-(b.x+b.width/2)*k,y:(area.top+area.bottom)/2-(b.y+b.height/2)*k};
}
