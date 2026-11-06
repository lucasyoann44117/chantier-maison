// Rendu image par image d'une page de capture (déterministe via window.__seek).
// node pipeline/render.js <page.html> <dossier_images> <largeur> <hauteur> <dpr> <fps> <worker> <nb_workers>
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const [page,out,w,h,dpr,fps,wk,nw]=process.argv.slice(2);
(async()=>{fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:+w,height:+h},deviceScaleFactor:+dpr});
await p.goto('file://'+path.resolve(page));await p.waitForFunction(()=>window.__ready,null,{timeout:120000});await p.evaluate(()=>document.fonts.ready);
const N=Math.ceil(await p.evaluate(()=>window.__duration)*fps);
for(let i=+wk;i<N;i+=+nw){const f=path.join(out,`f${String(i).padStart(5,'0')}.jpg`);if(fs.existsSync(f))continue;
  await p.evaluate(t=>window.__seek(t),i/fps);await p.screenshot({path:f,type:'jpeg',quality:92});}
await b.close();console.log('worker',wk,'terminé,',N,'images');})();
