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
await long.close();await browser.close();
await fs.writeFile(path.join(out,'results.json'),JSON.stringify({scope:'Chromium HTTP layout tests; not real inbox or coupon acceptance',results},null,2));
console.log(JSON.stringify(results.map(x=>({width:x.width,check:x.check,pass:x.pass,issues:x.issues})),null,2));
if(failed)process.exitCode=1;
