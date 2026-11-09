import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const out='circle-tools/qa-output';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const results=[];
let failed=false;
for(const width of [600,768,375,320]){
 const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173/circle-tools/preview.html',{waitUntil:'networkidle'});
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('td.art')].map(td=>new Promise((resolve,reject)=>{const url=getComputedStyle(td).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];if(!url)return reject(new Error('Missing decorative background'));const im=new Image();im.onload=resolve;im.onerror=()=>reject(new Error('Artwork failed to load'));im.src=url;})));});
 const audit=await page.evaluate(()=>({terms:document.querySelector('.coupon-terms')?.innerText,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,logoLoaded:[...document.images].every(x=>x.complete&&x.naturalWidth>0),coupon:document.querySelector('.coupon').innerText,cta:document.querySelector('.cta').href,sections:[...document.querySelectorAll('td.art')].map(td=>{const r=td.getBoundingClientRect();const texts=[...td.querySelectorAll('h1,h2,p')].map(e=>{const b=e.getBoundingClientRect();return {text:e.innerText,left:b.left,right:b.right,bottom:b.bottom};});return {name:td.className,top:r.top,bottom:r.bottom,texts};})}));
 const issues=[];
 if(audit.scrollWidth>width)issues.push('Horizontal overflow');
 if(!audit.terms?.includes('9 November 2027'))issues.push('Coupon expiry missing');
 if(!audit.logoLoaded)issues.push('Logo did not load');
 if(audit.coupon!=='CIRCLE10')issues.push('Approved coupon missing');
 if(audit.cta!=='https://sisireimagines.etsy.com/')issues.push('Wrong shop URL');
 for(const s of audit.sections)for(const t of s.texts){if(t.bottom>s.bottom+1)issues.push(`${s.name}: text below section`);if(t.left<0||t.right>width+1)issues.push(`${s.name}: text outside viewport`);}
 issues.push(...errors);
 await page.screenshot({path:path.join(out,`circle-${width}px.png`),fullPage:true});
 results.push({...audit,issues,pass:issues.length===0});if(issues.length)failed=true;
 if(width===375){await page.emulateMedia({colorScheme:'dark'});await page.screenshot({path:path.join(out,'circle-375px-dark-preference.png'),fullPage:true});}
 await page.close();
}
// Visual fallback and maximum coupon length are separate, targeted checks.
const fallback=await browser.newPage({viewport:{width:320,height:900}});
await fallback.route('**/*.png',r=>r.abort());
await fallback.goto('http://127.0.0.1:4173/circle-tools/preview.html');
const text=await fallback.locator('body').innerText();
const fallbackPass=text.includes('Welcome to')&&text.includes('10% off')&&text.includes('Unsubscribe');
await fallback.screenshot({path:path.join(out,'circle-320px-images-off.png'),fullPage:true});
results.push({check:'Images blocked retains meaningful live text, coupon and footer',pass:fallbackPass});
failed ||=!fallbackPass;await fallback.close();
const long=await browser.newPage({viewport:{width:320,height:900}});
await long.goto('http://127.0.0.1:4173/circle-tools/preview.html',{waitUntil:'networkidle'});
await long.locator('.coupon').evaluate(el=>el.textContent='CIRCLE-ABCDEFGHIJKLMNOPQ');
const longPass=await long.evaluate(()=>document.documentElement.scrollWidth===innerWidth);
await long.screenshot({path:path.join(out,'circle-320px-long-coupon.png'),fullPage:true});
results.push({check:'Long sample coupon at 320px',pass:longPass});failed ||=!longPass;
await long.close();

// Reproduce the reported Gmail symptom by removing head CSS, then verify the inline fallback.
// This is a controlled CSS-loss regression; actual Gmail still needs a fresh test send.
const cssLossResults=[];
for (const [fixture,expectedPass] of [['qa/before-inline-fix.html',false],['preview.html',true]]) {
 const page=await browser.newPage({viewport:{width:600,height:900}});
 await page.goto('http://127.0.0.1:4173/circle-tools/'+fixture,{waitUntil:'networkidle'});
 await page.locator('style').evaluateAll(nodes=>nodes.forEach(n=>n.remove()));
 const metrics=await page.evaluate(()=>{
  const hero=document.querySelector('.hero-cell').getBoundingClientRect();
  const heading=document.querySelector('h1').getBoundingClientRect();
  const logo=document.querySelector('.logo').getBoundingClientRect();
  return {headingBottom:heading.bottom-hero.top,heroHeight:hero.height,logoTop:logo.top-hero.top,margin:getComputedStyle(document.querySelector('h1')).marginTop};
 });
 const safe=metrics.headingBottom<=330;
 const checkPass=safe===expectedPass;
 cssLossResults.push({fixture,expectedPass,safe,...metrics,pass:checkPass});
 await page.screenshot({path:path.join(out,expectedPass?'circle-inline-fallback-600px.png':'circle-reproduced-before-fix-600px.png'),fullPage:true});
 failed ||=!checkPass;await page.close();
}
results.push({check:'CSS-loss reproduces old title collision and inline fallback prevents it',details:cssLossResults,pass:cssLossResults.every(x=>x.pass)});


const importHtml=await fs.readFile('circle-tools/tools-welcome.email.html','utf8');
const styleBodies=[...importHtml.matchAll(/<style[^>]*>([\\s\\S]*?)<\\/style>/g)].map(m=>m[1]);
if(styleBodies.some(css=>css.includes('}}')||css.includes('&#125;')))throw new Error('Adjacent style braces can be entity-encoded during provider sending');
for(const width of [375,600]){
 const page=await browser.newPage({viewport:{width,height:900}});
 let html=await fs.readFile('circle-tools/preview.html','utf8');
 html=html.replace(/<style([^>]*)>([\\s\\S]*?)<\\/style>/g,(_all,attrs,css)=>'<style'+attrs+'>'+css.replace(/\\}\\}/g,'&#125;&#125;')+'</style>');
 await page.setContent(html,{waitUntil:'networkidle'});
 const metrics=await page.evaluate(()=>({font:getComputedStyle(document.querySelector('h1')).fontSize,copy:getComputedStyle(document.querySelector('.copy')).fontSize,logo:document.querySelector('.logo').getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth}));
 const pass=metrics.font===(width===600?'68px':'45px')&&metrics.copy===(width===600?'23px':'17px')&&metrics.logo===(width===600?208:173)&&!metrics.overflow;
 results.push({check:'Provider closing-brace encoding preserves approved responsive typography',width,...metrics,pass});failed ||=!pass;
 await page.screenshot({path:path.join(out,'circle-provider-safe-'+width+'px.png'),fullPage:true});await page.close();
}

await browser.close();
await fs.writeFile(path.join(out,'results.json'),JSON.stringify({scope:'Chromium HTTP layout tests; not real inbox or coupon acceptance',results},null,2));
console.log(JSON.stringify(results.map(x=>({width:x.width,check:x.check,pass:x.pass,issues:x.issues})),null,2));
if(failed)process.exitCode=1;
