const { chromium } = require('playwright-core');
const fs = require('fs');
const CHROME = require('child_process').execSync("find " + process.env.HOME + "/.cache/ms-playwright -path '*chromium-*' -name chrome -type f", {encoding:'utf8'}).trim().split('\n')[0];

// react route -> shot name ; design ref file -> same shot name
const PAIRS = [
  ['/dashboard','Command Dashboard','dashboard'],
  ['/pricing','Pricing Engine','pricing'],
  ['/catalogue','Catalogue','catalogue'],
  ['/sales-orders','Sales Order Entry','sales'],
  ['/purchase-orders','Purchase Orders','purchasing'],
  ['/reporting','Reporting','reporting'],
  ['/clients','Client Account','client'],
  ['/samples','Sample Tracking','samples'],
  ['/library','Library Browse','library'],
  ['/product','Product Page','product'],
  ['/project','Project Folder','project'],
  ['/journal','Journal','journal'],
  ['/journal/story','Journal Story','journalstory'],
  ['/storefront','Trade Portal','storefront'],
  ['/account','My Account','account'],
];
const EXTRA = [['/','','cover'],['/collections','','collections'],['/sample-request','','samplereq']];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args:['--no-sandbox','--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport:{ width:1440, height:1000 }, deviceScaleFactor:1 });
  async function shot(url, file, waitMs){
    const page = await ctx.newPage();
    const errs=[];
    page.on('pageerror',e=>errs.push(String(e.message||e).slice(0,160)));
    try{ await page.goto(url,{waitUntil:'networkidle',timeout:20000}); }catch(e){}
    await page.waitForTimeout(waitMs||900);
    await page.screenshot({ path:'shots/'+file+'.png', fullPage:true });
    await page.close();
    return errs;
  }
  for (const [route,,name] of [...PAIRS, ...EXTRA]){
    const e = await shot('http://localhost:4288/#'+route, 'react_'+name, 900);
    console.log('react  '+name.padEnd(13), e.length?('ERR '+e[0]):'ok');
  }
  for (const [,ref,name] of PAIRS){
    const url = 'http://localhost:4299/'+encodeURIComponent(ref)+'.dc.html';
    const e = await shot(url, 'design_'+name, 1500);
    console.log('design '+name.padEnd(13), e.length?('ERR '+e[0]):'ok');
  }
  await browser.close();
  console.log('DONE');
})().catch(e=>{ console.error('FATAL', e.message); process.exit(1); });
