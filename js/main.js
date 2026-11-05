import { A, loadAtlas, loadImage, loadJSON } from './engine/assets.js';
import { Audio } from './engine/audio.js';
import { WIDTH, HEIGHT } from './engine/draw.js';
import { laneForCode } from './engine/settings.js';
import { drawText } from './engine/text.js';
import { VolumeTray } from './engine/volumetray.js';
import { game } from './game.js';
import { MainMenuState } from './states/mainmenu.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let viewScale = 1;
let dpr = 1;

function resize() {
  viewScale = Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT);
  dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${WIDTH * viewScale}px`;
  canvas.style.height = `${HEIGHT * viewScale}px`;
  canvas.width = Math.round(WIDTH * viewScale * dpr);
  canvas.height = Math.round(HEIGHT * viewScale * dpr);
}
window.addEventListener('resize', resize);
resize();

const BLOCK_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Backspace']);

window.addEventListener('keydown', e => {
  Audio.ensure();
  if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
  const volumeKey = { Minus: -1, NumpadSubtract: -1, Equal: 1, NumpadAdd: 1, Digit0: 0, Numpad0: 0 }[e.code];
  if (volumeKey !== undefined && !(game.state && game.state.binding) && laneForCode(e.code) < 0) {
    if (volumeKey) Audio.changeVolume(volumeKey);
    else Audio.toggleMute();
    VolumeTray.show();
    return;
  }
  if (game.busy || !game.state || !game.state.onKeyDown) return;
  game.state.onKeyDown(e);
});
window.addEventListener('keyup', e => {
  if (game.state && game.state.onKeyUp) game.state.onKeyUp(e);
});

function toGame(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * WIDTH, y: ((e.clientY - r.top) / r.height) * HEIGHT };
}
canvas.addEventListener('mousemove', e => {
  if (game.state && game.state.onMouseMove) { const p = toGame(e); game.state.onMouseMove(p.x, p.y); }
});
canvas.addEventListener('mousedown', e => {
  Audio.ensure();
  if (game.busy || !game.state || !game.state.onMouseDown) return;
  const p = toGame(e);
  game.state.onMouseDown(p.x, p.y, e);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state && game.state.onBlur) game.state.onBlur();
});

let last = performance.now();
let fpsFrames = 0;
let fpsTime = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    game.fps = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0;
    fpsTime = 0;
  }
  game.update(dt);
  ctx.setTransform(viewScale * dpr, 0, 0, viewScale * dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  game.draw(ctx);
  requestAnimationFrame(frame);
}

function drawMessage(text, sub = '') {
  ctx.setTransform(viewScale * dpr, 0, 0, viewScale * dpr, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawText(ctx, text, WIDTH / 2, HEIGHT / 2, { size: 40 });
  if (sub) drawText(ctx, sub, WIDTH / 2, HEIGHT / 2 + 50, { size: 18, strokeWidth: 0, weight: '400', font: 'sans-serif' });
}

async function boot() {
  if (location.protocol === 'file:') {
    document.getElementById('file-warning').hidden = false;
    return;
  }
  drawMessage('Loading...');
  try {
    await Promise.all([
      loadImage('assets/images/stage-menu.jpg').then(i => { A.menuBG = i; }),
      loadImage('assets/images/logo.webp').then(i => { A.logo = i; }),
      loadImage('assets/images/icons/icon-bf.png').then(i => { A.iconBF = i; }),
      loadAtlas('assets/images/mainmenu/menu_items').then(a => { A.menuItems = a; }),
      loadAtlas('assets/images/NOTE_assets').then(a => { A.notes = a; }),
      loadAtlas('assets/images/noteSplashes').then(a => { A.splashes = a; }),
      loadAtlas('assets/images/ui/alphabet').then(a => { A.alphabet = a; }),
      loadImage('assets/images/ui/healthBar.png').then(i => { A.healthBar = i; }),
      loadImage('assets/images/ui/volumebox.png').then(i => { A.volumeBox = i; }),
      Promise.all([...Array(10)].map((_, i) => loadImage(`assets/images/ui/bars_${i + 1}.png`))).then(l => { A.volumeBars = l; }),
      loadJSON('songs/songs.json').then(j => { A.songs = j; }),
      loadAtlas('assets/images/ui/gameText').then(a => { A.gameText = a; }),
      loadAtlas('assets/images/characters/BOYFRIEND'),
    ]);
  } catch (err) {
    console.error(err);
    drawMessage('Failed to load assets', err.message);
    return;
  }
  game.setState(new MainMenuState());
  requestAnimationFrame(frame);
}

boot();
