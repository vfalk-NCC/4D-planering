/* Renders docs/film (the cinematic product film) frame by frame to an H.264 file.
   Usage: node tools/render-film.js out.mp4 [width=1920] [fromSec=0] [toSec=90]   (needs playwright + ffmpeg) */
const { chromium } = require('playwright'), { spawn } = require('child_process'), path = require('path');
(async () => {
  const [out, w = 1920, from = 0, to = 90] = [process.argv[2], +process.argv[3] || 1920, +process.argv[4] || 0, +process.argv[5] || 90]; if (!out) { console.error('out.mp4 saknas'); process.exit(1); }
  const FPS = 30, h = Math.round(w * 9 / 16), n0 = Math.round(from * FPS), n1 = Math.round(to * FPS);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }), p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  p.on('pageerror', e => console.error('PAGEERR', e.message));
  await p.goto('file://' + path.resolve(__dirname, '../docs/film/index.html') + `?record=1&w=${w}`); await p.waitForFunction(() => window.filmReady);
  const t0 = Date.now();
  for (let i = n0; i < n1; i++) {
    const d = await p.evaluate(t => { film.seek(t); return film.grab(.95); }, i / FPS), buf = Buffer.from(d.split(',')[1], 'base64');
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 60 === 0) console.log(`frame ${i}/${n1} (${((i - n0 + 1) / ((Date.now() - t0) / 1000)).toFixed(2)} fps)`);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); await b.close(); console.log('klar', out);
})();
