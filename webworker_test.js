const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));

  await page.evaluate(() => {
    const workerCode = `
      import { encode } from 'https://esm.sh/@jsquash/webp?bundle';
      self.onmessage = async (e) => {
          try {
              const { imageBitmap } = e.data;
              const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
              const ctx = canvas.getContext('2d');
              ctx.drawImage(imageBitmap, 0, 0);
              const imageData = ctx.getImageData(0, 0, imageBitmap.width, imageBitmap.height);
              const resultBuffer = await encode(imageData, { effort: 6, quality: 100 });
              self.postMessage({ buffer: resultBuffer }, [resultBuffer]);
          } catch(err) {
              self.postMessage({ error: err.message });
          }
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob), { type: 'module' });
    worker.onmessage = e => console.log('Worker reply', e.data);

    // Test basic message sending
    const canvas = document.createElement('canvas');
    canvas.width = 10;
    canvas.height = 10;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'red';
    ctx.fillRect(0,0,10,10);
    createImageBitmap(canvas).then(imageBitmap => {
        worker.postMessage({imageBitmap}, [imageBitmap]);
    });
  });

  await new Promise(r => setTimeout(r, 3000));
  await browser.close();
})();
