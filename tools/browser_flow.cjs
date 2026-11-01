const path = require('node:path');
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await playwright.chromium.launch({ channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2 });
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(process.env.GAME_URL || 'http://localhost:8060');
  await page.waitForFunction(()=>!document.querySelector('#loading'));
  await page.waitForTimeout(1500);
  await page.touchscreen.tap(170,420);
  await page.waitForTimeout(200);
  async function assertNativeInput() {
    const focused = await page.locator('input,textarea').evaluateAll(elements=>elements.some(e=>!e.disabled && e===document.activeElement));
    if (!focused) throw new Error('Expected the native web keyboard input to be focused');
  }
  await assertNativeInput();
  await page.keyboard.type('Web Test');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  async function findColorRun(x, color) {
    const screenshot = (await page.screenshot()).toString('base64');
    return page.evaluate(async ({screenshot,x,color})=>{
      const image = new Image();
      image.src='data:image/png;base64,'+screenshot;
      await image.decode();
      const pixels=document.createElement('canvas');
      pixels.width=image.width; pixels.height=image.height;
      const context=pixels.getContext('2d');
      context.drawImage(image,0,0);
      const data=context.getImageData(0,0,image.width,image.height).data;
      const ratio=image.width/innerWidth;
      const px=Math.round(x*ratio);
      let start=-1;
      for(let y=0;y<image.height;y++) {
        const i=(y*image.width+px)*4;
        const match=Math.abs(data[i]-color[0])<5 && Math.abs(data[i+1]-color[1])<5 && Math.abs(data[i+2]-color[2])<5;
        if(match && start<0) start=y;
        if(!match && start>=0) {
          if((y-start)/ratio>35) return (start+y)/2/ratio;
          start=-1;
        }
      }
      return null;
    },{screenshot,x,color});
  }
  for (const suffix of ['AŞIK','YUN','AVA']) {
    const y=await findColorRun(26,[255,255,255]);
    if(y===null) throw new Error('Active letter card was not found for '+suffix);
    await page.touchscreen.tap(160,y);
    await page.waitForTimeout(200);
    await assertNativeInput();
    await page.keyboard.type(suffix);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1100);
  }
  await page.screenshot({path:path.resolve(__dirname,'../output/web-tutorial.png')});
  const menuButton=await findColorRun(50,[251,120,82]);
  if(menuButton===null) throw new Error('Tutorial completion/menu button was not found');
  await page.touchscreen.tap(160,menuButton);
  await page.waitForTimeout(2200);
  await page.reload();
  await page.waitForFunction(()=>!document.querySelector('#loading'));
  await page.waitForTimeout(1600);
  await page.screenshot({path:path.resolve(__dirname,'../output/web-home-reloaded.png')});
  console.log({errors});
  if(errors.length) process.exitCode=1;
  await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
