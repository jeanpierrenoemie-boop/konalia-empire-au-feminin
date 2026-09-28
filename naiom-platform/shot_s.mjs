import puppeteer from 'puppeteer';
const b = await puppeteer.launch({args:['--no-sandbox']});
const p = await b.newPage();
await p.setViewport({width:1600,height:1000,deviceScaleFactor:1});
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://localhost:3010/agents/prospection',{waitUntil:'networkidle0',timeout:60000});
await new Promise(r=>setTimeout(r,2500));
await p.screenshot({path:'/tmp/sacha_top.png'});
console.log('pageerrors:', errs.slice(0,3));
