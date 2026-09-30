const CACHE='govtech-static-5e24d06de434';
const API='govtech-static-data-5e24d06de434';
const ASSETS=['/brand.css','/brand/digicampus-logo.svg','/fonts/dm-sans-400.woff2','/fonts/inter-500.woff2','/fonts/lexend-600.woff2','/','/index.html','/atlas.html','/solutions.css','/solutions.js','/portal-filters.mjs','/search.mjs','/geography.mjs','/collections.mjs','/atlas-navigation.mjs','/style.css','/atlas.css','/app.js','/network-layout.mjs','/vendor/d3.min.js','/vendor/leaflet.js','/vendor/leaflet.css','/fonts/space-grotesk.woff2','/fonts/ibm-plex-sans.woff2','/icon.svg','/icon-192.png','/icon-512.png','/manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('govtech-')&&![CACHE,API].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  // Do not bulk-download or offline-cache third-party map tiles.
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  if(['/data/ecosystem.json','/data/catalogue.json'].includes(url.pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(API);
      try{
        const response=await fetch(event.request);
        if(!response.ok)throw Error('API unavailable');
        await cache.put(url.pathname,response.clone());return response;
      }catch(error){
        const saved=await cache.match(url.pathname);
        if(saved){const headers=new Headers(saved.headers);headers.set('X-GovTech-Cache','offline');return new Response(await saved.arrayBuffer(),{headers,status:200});}
        throw error;
      }
    })());return;
  }
  if(url.pathname.startsWith('/api/'))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(event.request.mode==='navigate'){
      try{return await fetch(event.request);}catch{return await cache.match(url.pathname==='/atlas.html'?'/atlas.html':'/index.html');}
    }
    try{const response=await fetch(event.request);if(response.ok&&ASSETS.includes(url.pathname))await cache.put(url.pathname,response.clone());return response;}catch{return await cache.match(url.pathname)||Response.error();}
  })());
});
