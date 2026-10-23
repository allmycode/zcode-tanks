'use strict';
/* ============================================================
   BATTLE TANKS — tribute to Battle City (NES)
   Canvas 256x240, поле 208x208 (13x13 тайлов по 16px)
   ============================================================ */

// ---------- Canvas / масштаб ----------
const cv = document.getElementById('game');
const g = cv.getContext('2d');
g.imageSmoothingEnabled = false;

function fit() {
  let s = Math.floor(Math.min(innerWidth / 256, innerHeight / 240));
  if (s < 1) { // маленький экран — нецелый масштаб
    s = Math.min(innerWidth / 256, innerHeight / 240);
  }
  cv.style.width = (256 * s) + 'px';
  cv.style.height = (240 * s) + 'px';
}
addEventListener('resize', fit);
fit();

// ---------- Константы ----------
const STEP = 1 / 60;
const FX = 8, FY = 8;           // смещение поля на экране
const FIELD = 208;              // размер поля
const SUB = 8, N = 26;          // сетка 26x26 полутайлов по 8px
const T_EMPTY = 0, T_BRICK = 1, T_STEEL = 2, T_WATER = 3, T_TREES = 4, T_ICE = 5;
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]; // 0 up, 1 right, 2 down, 3 left
const EAGLE_X = 96, EAGLE_Y = 192;            // база (орёл)
const ARMOR_SUBS = [[11,23],[11,24],[11,25],[14,23],[14,24],[14,25],[12,23],[13,23]];

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => Math.floor(rnd(a, b + 1));
const overlap = (ax, ay, aw, ah, bx, by, bw, bh) =>
  ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

// ---------- Ввод ----------
const keys = {};
let dirStack = [];       // порядок нажатий (последнее — активное)
let wantFire = false;
const CODE2DIR = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };

addEventListener('keydown', e => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  audioInit();
  if (e.repeat) { keys[e.code] = true; return; }
  keys[e.code] = true;
  const d = CODE2DIR[e.code];
  if (d !== undefined && !dirStack.includes(e.code)) dirStack.push(e.code);
  if (e.code === 'Space' || e.code === 'KeyZ' || e.code === 'KeyJ') wantFire = true;
  if (e.code === 'KeyM') { muted = !muted; }
  if (e.code === 'KeyP' && mode === 'play') { paused = !paused; sfx.pause(); }
  if (e.code === 'Escape' && mode === 'play') { paused = !paused; sfx.pause(); }
  if (e.code === 'Enter' || (mode === 'title' && e.code === 'Space')) onEnter();
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  dirStack = dirStack.filter(c => c !== e.code);
});
addEventListener('blur', () => { if (mode === 'play' && !paused) { paused = true; } });

// ---------- Звук (Web Audio) ----------
let AC = null, master = null, muted = false, engineNode = null;

function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume().catch(() => {}); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain();
    master.gain.value = 0.4;
    master.connect(AC.destination);
  } catch (e) { /* без звука */ }
}
function tone(f, dur, type = 'square', vol = 0.2, when = 0, f2 = null) {
  if (!AC || muted) return;
  try {
    const t = AC.currentTime + when;
    const o = AC.createOscillator(), ga = AC.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    ga.gain.setValueAtTime(vol, t);
    ga.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(ga); ga.connect(master);
    o.start(Math.max(AC.currentTime, t)); o.stop(Math.max(AC.currentTime, t) + dur + 0.03);
  } catch (e) { /* звук не должен ломать игру */ }
}
function noise(dur, vol = 0.25, fc = 1000, fc2 = null, when = 0) {
  if (!AC || muted) return;
  try {
    const t = AC.currentTime + when;
    const len = Math.max(1, (dur * AC.sampleRate) | 0);
    const buf = AC.createBuffer(1, len, AC.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = AC.createBufferSource(); s.buffer = buf;
    const f = AC.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(fc, t);
    if (fc2) f.frequency.exponentialRampToValueAtTime(fc2, t + dur);
    const ga = AC.createGain();
    ga.gain.setValueAtTime(vol, t);
    ga.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(ga); ga.connect(master);
    s.start(Math.max(AC.currentTime, t)); s.stop(Math.max(AC.currentTime, t) + dur + 0.03);
  } catch (e) { /* звук не должен ломать игру */ }
}
const sfx = {
  fire()        { tone(880, 0.07, 'square', 0.16, 0, 240); },
  brick()       { noise(0.09, 0.3, 1400, 500); },
  steel()       { tone(1568, 0.06, 'triangle', 0.2); tone(2093, 0.08, 'triangle', 0.1, 0.03); },
  explS()       { noise(0.22, 0.3, 1600, 220); tone(110, 0.15, 'sine', 0.22, 0, 55); },
  explB()       { noise(0.5, 0.38, 1500, 140); tone(80, 0.4, 'sine', 0.35, 0, 38); },
  pause()       { tone(988, 0.08, 'square', 0.18); tone(740, 0.08, 'square', 0.18, 0.11); },
  appear()      { [988,1319,988,1319,1568,2093].forEach((f,i)=>tone(f,0.07,'square',0.15,i*0.07)); },
  pick()        { [523,659,784,1047,1319].forEach((f,i)=>tone(f,0.08,'square',0.18,i*0.07)); },
  life()        { [659,784,988,1319,1568].forEach((f,i)=>tone(f,0.1,'triangle',0.2,i*0.09)); },
  intro() {
    const lead = [[392,.14],[392,.14],[392,.14],[523,.2],[659,.2],[784,.45]];
    const bass = [[98,.14],[98,.14],[98,.14],[131,.2],[165,.2],[196,.45]];
    let t = 0;
    lead.forEach((n,i) => {
      tone(n[0], n[1]*0.95, 'square', 0.16, t);
      tone(bass[i][0], bass[i][1]*0.95, 'triangle', 0.2, t);
      t += n[1];
    });
  },
  over() {
    [[392,.25],[330,.25],[262,.25],[196,.6]].forEach((n,i)=>tone(n[0],n[1],'square',0.18,i*0.24));
    tone(98, 0.9, 'triangle', 0.22, 0.72);
  },
  tick() { tone(1046, 0.05, 'square', 0.14); },
};
function engineUpdate(active) {
  if (!AC) return;
  try {
    if (!engineNode) {
      engineNode = { o: AC.createOscillator(), ga: AC.createGain() };
      engineNode.o.type = 'sawtooth';
      engineNode.o.frequency.value = 55;
      engineNode.ga.gain.value = 0;
      engineNode.o.connect(engineNode.ga); engineNode.ga.connect(master);
      engineNode.o.start();
    }
    if (muted || mode !== 'play' || paused || !player || playerDead) {
      engineNode.ga.gain.value = 0;
      return;
    }
    engineNode.ga.gain.value = 0.015;
    engineNode.o.frequency.setTargetAtTime(active ? 92 : 60, AC.currentTime, 0.06);
  } catch (e) { /* звук не должен ломать игру */ }
}

// ---------- Спрайты ----------
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

const TREAD_D = '#2e2e2e', TREAD_L = '#9a9a9a';
const PALS = {
  player: { main: '#E8B028', lite: '#F8E0A0', dark: '#7A5000' },
  basic:  { main: '#B0B0B0', lite: '#E8E8E8', dark: '#464646' },
  fast:   { main: '#58B828', lite: '#A8E878', dark: '#1E5A10' },
  power:  { main: '#90A8E8', lite: '#E0E8FF', dark: '#384878' },
  armor4: { main: '#28A428', lite: '#90E890', dark: '#0C5A0C' },
  armor3: { main: '#C0B018', lite: '#F8F0A0', dark: '#605808' },
  armor2: { main: '#E07818', lite: '#FFC060', dark: '#703008' },
  armor1: { main: '#D83028', lite: '#FF8878', dark: '#6A1008' },
  flashA: { main: '#E84028', lite: '#FFD0C0', dark: '#701008' },
  flashB: { main: '#F0F0F0', lite: '#FFFFFF', dark: '#808080' },
};

const tankCache = new Map();
function tankSprite(name, frame) {
  const key = name + '_' + frame;
  if (tankCache.has(key)) return tankCache.get(key);
  const pal = PALS[name];
  const c = mkCanvas(16, 16), q = c.getContext('2d');
  // гусеницы
  q.fillStyle = TREAD_D;
  q.fillRect(0, 0, 3, 1); q.fillRect(13, 0, 3, 1);
  q.fillRect(0, 15, 3, 1); q.fillRect(13, 15, 3, 1);
  for (let y = 1; y < 15; y++) {
    q.fillStyle = ((y + frame * 2) & 3) < 2 ? TREAD_L : TREAD_D;
    q.fillRect(0, y, 3, 1); q.fillRect(13, y, 3, 1);
  }
  // корпус
  q.fillStyle = pal.dark;  q.fillRect(3, 4, 10, 12);
  q.fillStyle = pal.main;  q.fillRect(4, 5, 8, 10);
  q.fillStyle = pal.lite;  q.fillRect(4, 5, 8, 1);
  q.fillStyle = pal.dark;  q.fillRect(5, 10, 1, 4); q.fillRect(10, 10, 1, 4);
  // башня
  q.fillStyle = pal.dark;  q.fillRect(5, 6, 6, 7);
  q.fillStyle = pal.main;  q.fillRect(6, 7, 4, 5);
  q.fillStyle = pal.lite;  q.fillRect(7, 8, 2, 2);
  // ствол
  q.fillStyle = pal.dark;  q.fillRect(6, 0, 4, 7);
  q.fillStyle = pal.main;  q.fillRect(7, 1, 2, 6);
  q.fillStyle = pal.lite;  q.fillRect(7, 0, 2, 1);
  tankCache.set(key, c);
  return c;
}

// --- тайлы 8x8 ---
function tileCanvas(draw) { const c = mkCanvas(8, 8); draw(c.getContext('2d')); return c; }
const TILES = {};
TILES.brick = tileCanvas(q => {
  q.fillStyle = '#B83C14'; q.fillRect(0, 0, 8, 8);
  q.fillStyle = '#E88048'; q.fillRect(0, 0, 8, 3); q.fillRect(0, 4, 8, 3);
  q.fillStyle = '#8C2810'; q.fillRect(0, 3, 8, 1); q.fillRect(0, 7, 8, 1);
  q.fillRect(3, 0, 1, 3); q.fillRect(7, 4, 1, 3);
  q.fillStyle = '#F8C088'; q.fillRect(0, 0, 2, 1); q.fillRect(4, 0, 3, 1); q.fillRect(1, 4, 2, 1);
});
TILES.steel = tileCanvas(q => {
  q.fillStyle = '#9A9A9A'; q.fillRect(0, 0, 8, 8);
  q.fillStyle = '#F8F8F8'; q.fillRect(0, 0, 8, 1); q.fillRect(0, 0, 1, 8);
  q.fillStyle = '#4C4C4C'; q.fillRect(0, 7, 8, 1); q.fillRect(7, 0, 1, 8);
  q.fillStyle = '#C8C8C8'; q.fillRect(2, 2, 4, 4);
  q.fillStyle = '#F8F8F8'; q.fillRect(3, 3, 2, 2);
});
TILES.water = [0, 1].map(f => tileCanvas(q => {
  q.fillStyle = '#1838C8'; q.fillRect(0, 0, 8, 8);
  q.fillStyle = '#3878F8';
  if (f === 0) { q.fillRect(1, 2, 3, 1); q.fillRect(5, 4, 3, 1); q.fillRect(2, 6, 3, 1); }
  else         { q.fillRect(2, 3, 3, 1); q.fillRect(4, 5, 3, 1); q.fillRect(3, 7, 3, 1); q.fillRect(0, 1, 2, 1); }
}));
TILES.trees = tileCanvas(q => {
  q.fillStyle = '#0A6E0A'; q.fillRect(0, 0, 8, 8);
  q.fillStyle = '#00A800'; q.fillRect(0, 0, 3, 3); q.fillRect(4, 2, 3, 3); q.fillRect(2, 5, 3, 3);
  q.fillStyle = '#58D854'; q.fillRect(1, 1, 1, 1); q.fillRect(5, 3, 1, 1); q.fillRect(3, 6, 1, 1); q.fillRect(6, 6, 1, 1);
  q.fillStyle = '#B8F818'; q.fillRect(4, 0, 1, 1); q.fillRect(0, 5, 1, 1);
});
TILES.ice = tileCanvas(q => {
  q.fillStyle = '#D0DCE8'; q.fillRect(0, 0, 8, 8);
  q.fillStyle = '#F8FCFF'; q.fillRect(1, 1, 2, 1); q.fillRect(4, 3, 2, 1); q.fillRect(2, 6, 2, 1);
  q.fillStyle = '#A8BCD0'; q.fillRect(5, 1, 2, 1); q.fillRect(1, 4, 2, 1); q.fillRect(6, 5, 1, 2);
  q.fillStyle = '#6888A8'; q.fillRect(0, 7, 1, 1); q.fillRect(7, 0, 1, 1);
});

// --- пиксельные иконки из строк ---
function spriteFromStrings(rows, pal) {
  const c = mkCanvas(rows[0].length, rows.length), q = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (col) { q.fillStyle = col; q.fillRect(x, y, 1, 1); }
    }
  });
  return c;
}
const SPR = {};
SPR.eagle = spriteFromStrings([
  '................',
  '.......ww.......',
  '......wssw......',
  '......swws......',
  '..s...wssw...s..',
  '.sss..ssss..sss.',
  'sssss.ssss.sssss',
  'sswsssssssssswss',
  'sssssswwwwssssss',
  '.ssssswwwwsssss.',
  '..sssssssssss...',
  '...ssssssss.....',
  '.....ssss.......',
  '...ssssssss.....',
  '..ssssssssss....',
  '.dddddddddddd...',
], { s: '#C8C8C8', w: '#F0F0F0', d: '#707070' });
SPR.eagleDead = spriteFromStrings([
  '................',
  '.........oooo...',
  '........oooooo..',
  '.......oo..ooo..',
  '.......oooooo...',
  '.......oooo.....',
  '.......oo.......',
  '.......oo.......',
  '.......oo.......',
  '.......oo.......',
  '.......oo.......',
  '....s..oo..s....',
  '...sss.ss.sss...',
  '..sssssssssss...',
  '.ssssssssssss...',
  '.dddddddddddd...',
], { s: '#909090', o: '#D83028', d: '#606060' });

SPR.star = spriteFromStrings([
  '................',
  '.......yy.......',
  '.......yy.......',
  '......yyyy......',
  '......yyyy......',
  '.....yyyyyy.....',
  'yyyyyyyyyyyyyyyy',
  '.yyyyyyyyyyyyyy.',
  '..yyyyyyyyyyyy..',
  '...yyyyyyyyyy...',
  '....yyyyyyyy....',
  '...yyy....yyy...',
  '..yyy......yyy..',
  '..yy........yy..',
  '................',
  '................',
], { y: '#F8B838' });
SPR.helmet = spriteFromStrings([
  '................',
  '................',
  '.....wwwwww.....',
  '....wwwwwwww....',
  '...wwwwwwwwww...',
  '..wwwwwwwwwwww..',
  '..wwwwwwwwwwww..',
  '..wsswwwwwwssw..',
  '..wsswwwwwwssw..',
  '..wwwwwwwwwwww..',
  '...wwwwwwwwww...',
  '....ssssssss....',
  '................',
  '................',
  '................',
  '................',
], { w: '#D8D8E8', s: '#4C5C88' });
SPR.grenade = spriteFromStrings([
  '................',
  '......ss........',
  '......ss........',
  '.....ssss.......',
  '....wwwwww......',
  '...wwwwwwww.....',
  '..wwwsssswww....',
  '..wwsswwssww....',
  '..wwsswwssww....',
  '..wwwsssswww....',
  '...wwwwwwww.....',
  '....wwwwww......',
  '................',
  '................',
  '................',
  '................',
], { w: '#B8B8B8', s: '#4C4C4C' });
SPR.clock = spriteFromStrings([
  '................',
  '....ww....ww....',
  '...w.wwwwww.w...',
  '....wwwwwwww....',
  '...wwwsswwwww...',
  '...wwwsswwwww...',
  '...wwwwwwwwww...',
  '...wwwwwwwwww...',
  '...wwwwwwwwww...',
  '....wwwwwwww....',
  '...w.wwwwww.w...',
  '....ww....ww....',
  '................',
  '................',
  '................',
  '................',
], { w: '#E8E8E8', s: '#F8B838' });
SPR.shovel = spriteFromStrings([
  '................',
  '.......bb.......',
  '.......bb.......',
  '.......bb.......',
  '......bbbb......',
  '......bbbb......',
  '.....wwbbww.....',
  '.....wwwwww.....',
  '....wwwwwwww....',
  '....wwwwwwww....',
  '.....wwwwww.....',
  '......wwww......',
  '................',
  '................',
  '................',
  '................',
], { b: '#A87848', w: '#C8C8C8' });
SPR.tankLife = spriteFromStrings([
  '................',
  '.......yy.......',
  '.......yy.......',
  '.......yy.......',
  '.dddddyyyyddddd.',
  '.dllllyyyydllld.',
  '.dl.lyyyyyl.dld.',
  '.dl.lyyyyyl.dld.',
  '.dllllyyyylllld.',
  '.dddddyyyyddddd.',
  '.dddddyyyyddddd.',
  '..ddd.yyyy.ddd..',
  '................',
  '................',
  '................',
  '................',
], { y: '#F8B838', d: '#8A5A00', l: '#F8E0A0' });
const POWER_SPR = { star: SPR.star, helmet: SPR.helmet, grenade: SPR.grenade, timer: SPR.clock, shovel: SPR.shovel, tank: SPR.tankLife };

// --- взрывы (кадры: список прямоугольников относительно центра) ---
const BOOM_SMALL = [
  [[-2,-2,4,4,'#F8F8F8']],
  [[-4,-4,8,8,'#F8A030'],[-2,-2,4,4,'#F8F8F8']],
  [[-6,-6,12,12,'#E85028'],[-3,-3,6,6,'#F8D878'],[7,-7,3,3,'#F8A030'],[-8,5,3,3,'#F8A030'],[5,7,3,3,'#F8A030'],[-7,-8,3,3,'#F8A030']],
];
const BOOM_BIG = [
  [[-3,-3,6,6,'#F8D878']],
  [[-6,-1,12,2,'#F87858'],[-1,-6,2,12,'#F87858'],[-2,-2,4,4,'#F8F8F8']],
  [[-8,-8,16,16,'#E85028'],[-5,-5,10,10,'#F8A030'],[-2,-2,4,4,'#F8F8F8'],[-11,-1,4,2,'#F8A030'],[7,-1,4,2,'#F8A030'],[-1,-11,2,4,'#F8A030'],[-1,7,2,4,'#F8A030']],
  [[-12,-12,6,6,'#E85028'],[6,-12,6,6,'#F8A030'],[-12,6,6,6,'#F8A030'],[6,6,6,6,'#E85028'],[-2,-2,4,4,'#F8F8F8']],
  [[-12,-12,3,3,'#902810'],[9,-9,3,3,'#902810'],[-9,9,3,3,'#C04818'],[6,6,3,3,'#902810'],[0,-12,2,2,'#C04818'],[-2,10,2,2,'#902810'],[10,2,2,2,'#C04818'],[-12,0,2,2,'#902810']],
];

// ---------- Карты (13x13, 16px на символ) ----------
// . пусто  # кирпич  @ броня  ~ вода  % лес  - лёд
const MAPS = [
  [ // 1
    '.............',
    '.##.##.##.##.',
    '.##.##.##.##.',
    '.##.##.##.##.',
    '.............',
    '..#..@#@..#..',
    '..#..@#@..#..',
    '..#..@#@..#..',
    '.............',
    '.##.##.##.##.',
    '.##.##.##.##.',
    '.##.##...##..',
    '.............',
  ],
  [ // 2
    '@...........@',
    '.##.#####.##.',
    '.##.#@@@#.##.',
    '.##.#@@@#.##.',
    '.##.#####.##.',
    '.............',
    '##%%.###.%%##',
    '##%%.###.%%##',
    '.............',
    '.~~~.###.~~~.',
    '.~~~.#@#.~~~.',
    '.~~~.....~~~.',
    '.............',
  ],
  [ // 3
    '.....@@@.....',
    '.###.....###.',
    '.###.###.###.',
    '.....###.....',
    '---%.###.%---',
    '---%.....%---',
    '-------------',
    '---%.....%---',
    '---%.###.%---',
    '.....###.....',
    '.###.###.###.',
    '.###.....###.',
    '.............',
  ],
  [ // 4
    '.............',
    '.##...#...##.',
    '.##.~~~~~.##.',
    '.##.~@@@~.##.',
    '....~@#@~....',
    '.#..~@@@~..#.',
    '.#...~~~...#.',
    '.#....@....#.',
    '.###..@..###.',
    '......@......',
    '.%%.......%%.',
    '.%%..###..%%.',
    '.............',
  ],
  [ // 5
    '##.#.....#.##',
    '##.#.###.#.##',
    '....#.#.#....',
    '.##..#@#..##.',
    '.#.#.#@#.#.#.',
    '.#.........#.',
    '.#.##@-@##.#.',
    '.#.........#.',
    '####.#.#.####',
    '...#.#.#.#...',
    '.#.#.#.#.#.#.',
    '.#.#.....#.#.',
    '.............',
  ],
  [ // 6
    '@~%.......%~@',
    '@~%.#####.%~@',
    '...#.#@#.#...',
    '.%.#.#.#.#.%.',
    '.-.#####.###.',
    '---..@#@..---',
    '%%%..@@@..%%%',
    '---..@#@..---',
    '.-.##...##.-.',
    '.%.##.#.##.%.',
    '...#.....#...',
    '@~%.#####.%~@',
    '@~%.......%~@',
  ],
];
MAPS.forEach(m => m.forEach((row, i) => {
  if (row.length !== 13) console.warn('Map row length != 13:', row, '(len ' + row.length + ')');
}));

const COMPS = [
  [18, 2, 0, 0],
  [14, 4, 2, 0],
  [12, 4, 2, 2],
  [10, 6, 2, 2],
  [ 8, 6, 4, 2],
  [ 6, 6, 4, 4],
];
const ENEMY_STATS = {
  basic: { speed: 34, bulletSpd: 150, pts: 100 },
  fast:  { speed: 58, bulletSpd: 150, pts: 200 },
  power: { speed: 44, bulletSpd: 240, pts: 300 },
  armor: { speed: 34, bulletSpd: 150, pts: 400 },
};

// ---------- Состояние игры ----------
let mode = 'title';   // title | intro | play | score | over
let paused = false;
let tick = 0, time = 0;
let stage = 1, menuStage = 1;
let score = 0, lives = 2, nextLife = 20000;
function loadHi() { try { return +(localStorage.getItem('tanks-hi') || 20000); } catch (e) { return 20000; } }
function saveHi(v) { try { localStorage.setItem('tanks-hi', v); } catch (e) {} }
let hi = loadHi();
let terr = new Uint8Array(N * N);
let player = null, playerDead = false, respawnT = 0;
let enemies = [], bullets = [], booms = [], floats = [], spawnAnims = [];
let powerup = null;
let queue = [], spawnedCount = 0, flashIdx = new Set(), spawnTimer = 0;
let freezeT = 0, shovelT = 0, shovelFlashT = 0;
let kills = null;
let eagleDead = false;
let introT = 0, overSeq = -1, overT = 0, clearT = -1;
let scoreScreenT = 0, scoreRow = 0;
let playerMovingNow = false;

function addScore(pts) {
  score += pts;
  if (score >= nextLife) { lives++; nextLife += 20000; sfx.life(); }
  if (score > hi) { hi = score; saveHi(hi); }
}

// ---------- Поле ----------
const tIdx = (c, r) => r * N + c;
const tGet = (c, r) => terr[tIdx(c, r)];
const tSet = (c, r, v) => { terr[tIdx(c, r)] = v; };

function setArmorTile(v) { for (const [c, r] of ARMOR_SUBS) tSet(c, r, v); }

function buildTerr(mapIdx) {
  terr.fill(T_EMPTY);
  const m = MAPS[mapIdx];
  for (let r = 0; r < 13; r++) {
    for (let c = 0; c < 13; c++) {
      const ch = (m[r] || '')[c] || '.';
      let t = T_EMPTY;
      if (ch === '#') t = T_BRICK;
      else if (ch === '@') t = T_STEEL;
      else if (ch === '~') t = T_WATER;
      else if (ch === '%') t = T_TREES;
      else if (ch === '-') t = T_ICE;
      if (t !== T_EMPTY) {
        tSet(c * 2, r * 2, t); tSet(c * 2 + 1, r * 2, t);
        tSet(c * 2, r * 2 + 1, t); tSet(c * 2 + 1, r * 2 + 1, t);
      }
    }
  }
  // точки спавна всегда свободны: враги (0,0),(6,0),(12,0) и игрок (4,12)
  for (const [c, r] of [[0, 0], [6, 0], [12, 0], [4, 12]]) {
    tSet(c * 2, r * 2, T_EMPTY); tSet(c * 2 + 1, r * 2, T_EMPTY);
    tSet(c * 2, r * 2 + 1, T_EMPTY); tSet(c * 2 + 1, r * 2 + 1, T_EMPTY);
  }
  // зона базы — очистить и обложить кирпичом
  for (let c = 12; c <= 13; c++) { tSet(c, 24, T_EMPTY); tSet(c, 25, T_EMPTY); }
  setArmorTile(T_BRICK);
}

// ---------- Проходимость ----------
function terrainFree(x, y) { // для танка 16x16
  if (x < 0 || y < 0 || x + 16 > FIELD || y + 16 > FIELD) return false;
  if (overlap(x, y, 16, 16, EAGLE_X, EAGLE_Y, 16, 16)) return false;
  const c0 = Math.floor(x / SUB), c1 = Math.floor((x + 15.99) / SUB);
  const r0 = Math.floor(y / SUB), r1 = Math.floor((y + 15.99) / SUB);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const t = tGet(c, r);
    if (t === T_BRICK || t === T_STEEL || t === T_WATER) return false;
  }
  return true;
}
function tanksBlocked(self, x, y) {
  const list = [];
  if (player && !playerDead && self !== player) list.push(player);
  for (const e of enemies) if (e !== self) list.push(e);
  for (const o of list) {
    if (x < o.x + 16 - 0.05 && x + 16 > o.x + 0.05 &&
        y < o.y + 16 - 0.05 && y + 16 > o.y + 0.05) return true;
  }
  return false;
}
function tryMove(t, dist, dir) {
  const nx = t.x + DX[dir] * dist, ny = t.y + DY[dir] * dist;
  if (terrainFree(nx, ny) && !tanksBlocked(t, nx, ny)) {
    t.x = nx; t.y = ny;
    return true;
  }
  return false;
}
function onIce(t) {
  return tGet(Math.floor((t.x + 8) / SUB), Math.floor((t.y + 8) / SUB)) === T_ICE;
}

// ---------- Пули ----------
function spawnBullet(owner, tank, spd, power) {
  const cx = tank.x + 8 + DX[tank.dir] * 8;
  const cy = tank.y + 8 + DY[tank.dir] * 8;
  bullets.push({ x: cx - 2, y: cy - 2, dir: tank.dir, spd, owner, power, from: tank, dead: false });
}
function playerBulletCount() { let n = 0; for (const b of bullets) if (b.owner === 'player') n++; return n; }
function enemyBulletCount(e) { for (const b of bullets) if (b.from === e) return true; return false; }

function destroyStrip(b) {
  // вертикальная пуля: полоса 16px по X, слой 8px по Y; горизонтальная — наоборот
  if (b.dir === 0 || b.dir === 2) {
    const cx = b.x + 2;
    const cA = clamp(Math.floor((cx - 8) / SUB), 0, N - 1);
    const cB = clamp(Math.floor((cx + 7) / SUB), 0, N - 1);
    const r = clamp(Math.floor((b.dir === 0 ? b.y : b.y + 4) / SUB), 0, N - 1);
    return stripCells(cA, cB, r, r);
  } else {
    const cy = b.y + 2;
    const rA = clamp(Math.floor((cy - 8) / SUB), 0, N - 1);
    const rB = clamp(Math.floor((cy + 7) / SUB), 0, N - 1);
    const c = clamp(Math.floor((b.dir === 3 ? b.x : b.x + 4) / SUB), 0, N - 1);
    return stripCells(c, c, rA, rB);
  }
}
function stripCells(cA, cB, rA, rB) {
  let brick = false, steel = false;
  const cells = [];
  for (let r = rA; r <= rB; r++) for (let c = cA; c <= cB; c++) {
    const t = tGet(c, r);
    if (t === T_BRICK) { brick = true; cells.push([c, r]); }
    if (t === T_STEEL) { steel = true; cells.push([c, r]); }
  }
  return { brick, steel, cells };
}

function bulletTerrain(b) {
  const hit = destroyStrip(b);
  if (!hit.brick && !hit.steel) return false;
  if (hit.steel && b.power >= 2) {
    for (const [c, r] of hit.cells) tSet(c, r, T_EMPTY);
    boom(b.x + 2, b.y + 2, false);
    sfx.steel(); noise(0.12, 0.25, 800, 300);
  } else if (hit.steel) {
    boom(b.x + 2, b.y + 2, false);
    sfx.steel();
  } else {
    for (const [c, r] of hit.cells) if (tGet(c, r) === T_BRICK) tSet(c, r, T_EMPTY);
    boom(b.x + 2, b.y + 2, false);
    sfx.brick();
  }
  return true;
}

// ---------- Взрывы, всплывающие очки ----------
function boom(x, y, big) { booms.push({ x, y, t: 0, big }); }
function floatText(x, y, txt) { floats.push({ x, y, txt, t: 0 }); }

// ---------- Игрок ----------
function resetPlayer(shield) {
  player = {
    x: 64, y: 192, dir: 0, level: player ? player.level : 0,
    shield, anim: 0, moving: false, slideT: 0, slideDir: 0,
  };
  playerDead = false;
}
function killPlayer() {
  if (player.shield > 0) return;
  boom(player.x + 8, player.y + 8, true);
  sfx.explB();
  playerDead = true;
  player.level = 0;
  respawnT = 1.2;
  lives--;
  if (lives < 0) startGameOver();
}

// ---------- Враги ----------
function maxEnemies() { return stage < 5 ? 4 : 5; }

function buildQueue() {
  let comp;
  if (stage <= COMPS.length) comp = COMPS[stage - 1];
  else comp = [10, 4, 2, 4];
  const pools = { basic: comp[0], fast: comp[1], power: comp[2], armor: comp[3] };
  queue = [];
  let total = comp[0] + comp[1] + comp[2] + comp[3];
  while (total > 0) {
    const pick = ['basic', 'fast', 'power', 'armor'][Math.floor(Math.random() * 4)];
    if (pools[pick] > 0) { pools[pick]--; queue.push(pick); total--; }
  }
  flashIdx = new Set([3, 7, 11, 15, 19].filter(i => i < queue.length));
}

function spawnEnemyAnim() {
  const type = queue[spawnedCount];
  const sx = [0, 96, 192][spawnedCount % 3];
  spawnAnims.push({ x: sx, y: 0, t: 0, type, flash: flashIdx.has(spawnedCount) });
  spawnedCount++;
}
function materializeEnemy(a) {
  const st = ENEMY_STATS[a.type];
  const mul = 1 + Math.min(0.35, Math.max(0, stage - 6) * 0.05);
  enemies.push({
    x: a.x, y: a.y, dir: 2, type: a.type, flash: a.flash,
    hp: a.type === 'armor' ? 4 : 1,
    speed: st.speed * mul, bulletSpd: st.bulletSpd,
    shootT: rnd(0.8, 2.0), moveT: rnd(0.5, 1.5), blockedT: 0,
    anim: Math.random(), targetBase: Math.random() < 0.35,
  });
}
function chooseDir(e) {
  const r = Math.random();
  if (r < 0.4) {
    const tgt = e.targetBase || !player || playerDead
      ? { x: EAGLE_X, y: EAGLE_Y } : player;
    const dx = tgt.x - e.x, dy = tgt.y - e.y;
    const prefs = Math.abs(dx) > Math.abs(dy)
      ? [dx > 0 ? 1 : 3, dy > 0 ? 2 : 0]
      : [dy > 0 ? 2 : 0, dx > 0 ? 1 : 3];
    e.dir = Math.random() < 0.75 ? prefs[0] : prefs[1];
  } else {
    e.dir = irnd(0, 3);
  }
}
function damageEnemy(e) {
  if (e.type === 'armor' && e.hp > 1) {
    e.hp--;
    boom(e.x + 8, e.y + 8, false);
    sfx.steel();
    return;
  }
  killEnemy(e, true);
}
function killEnemy(e, byPlayer) {
  const i = enemies.indexOf(e);
  if (i >= 0) enemies.splice(i, 1);
  boom(e.x + 8, e.y + 8, true);
  sfx.explB();
  if (byPlayer) {
    const pts = ENEMY_STATS[e.type].pts;
    addScore(pts);
    kills[e.type]++;
    floatText(e.x + 8, e.y + 4, '' + pts);
  }
  if (e.flash) spawnPowerup();
}

// ---------- Бонусы ----------
function spawnPowerup() {
  const kinds = ['star', 'helmet', 'grenade', 'shovel', 'tank', 'timer'];
  const kind = kinds[irnd(0, kinds.length - 1)];
  let x = 32, y = 96;
  for (let i = 0; i < 80; i++) {
    const tx = irnd(0, 12) * 16, ty = irnd(0, 11) * 16;
    if (tx >= 64 && tx <= 112 && ty >= 144) continue;             // не рядом с базой
    let ok = true;
    const c0 = tx / SUB, r0 = ty / SUB;
    for (let r = r0; r < r0 + 2; r++) for (let c = c0; c < c0 + 2; c++) {
      const t = tGet(c, r);
      if (t === T_WATER || t === T_STEEL) ok = false;
    }
    if (ok) { x = tx; y = ty; break; }
  }
  powerup = { x, y, kind, t: 0 };
  sfx.appear();
}
function applyPowerup(kind) {
  floatText(powerup.x + 8, powerup.y + 4, '500');
  addScore(500);
  sfx.pick();
  switch (kind) {
    case 'star':   player.level = Math.min(3, player.level + 1); break;
    case 'helmet': player.shield = 10; break;
    case 'grenade':
      for (const e of enemies.slice()) {
        boom(e.x + 8, e.y + 8, true);
      }
      enemies = [];
      sfx.explB();
      break;
    case 'shovel': shovelT = 15; shovelFlashT = 0; setArmorTile(T_STEEL); break;
    case 'tank':   lives++; sfx.life(); break;
    case 'timer':  freezeT = 8; break;
  }
  powerup = null;
}

// ---------- База / конец игры ----------
function destroyEagle() {
  if (eagleDead) return;
  eagleDead = true;
  boom(EAGLE_X + 8, EAGLE_Y + 8, true);
  boom(EAGLE_X + 2, EAGLE_Y + 4, true);
  sfx.explB();
  startGameOver();
}
function startGameOver() { if (overSeq < 0) overSeq = 0; }

// ---------- Установка этапа ----------
function setupStage(n) {
  stage = n;
  buildTerr((n - 1) % MAPS.length);
  buildQueue();
  spawnedCount = 0;
  spawnTimer = 0.6;
  enemies = []; bullets = []; booms = []; floats = []; spawnAnims = [];
  powerup = null;
  freezeT = 0; shovelT = 0; shovelFlashT = 0;
  kills = { basic: 0, fast: 0, power: 0, armor: 0 };
  eagleDead = false;
  overSeq = -1; clearT = -1;
  paused = false;
  const keepLevel = player ? player.level : 0;
  resetPlayer(3);
  player.level = keepLevel;
  playerMovingNow = false;
  wantFire = false;
  mode = 'intro';
  introT = 0;
  sfx.intro();
}

function onEnter() {
  if (mode === 'title') {
    score = 0; lives = 2; nextLife = 20000;
    player = null; // сброс уровня танка
    setupStage(menuStage);
  } else if (mode === 'over') {
    mode = 'title';
  } else if (mode === 'score') {
    scoreScreenT = 99; // сразу дальше
  }
}

// ---------- Обновление ----------
function update(dt) {
  time += dt; tick++;
  if (mode === 'intro') {
    introT += dt;
    if (introT >= 2.0) mode = 'play';
    return;
  }
  if (mode === 'score') { updateScoreScreen(dt); return; }
  if (mode === 'over')  { overT += dt; return; }
  if (mode !== 'play' || paused) return;
  updatePlay(dt);
}

function updatePlay(dt) {
  // таймеры
  if (freezeT > 0) freezeT -= dt;
  if (shovelT > 0) {
    shovelT -= dt;
    if (shovelT <= 0) { shovelT = 0; shovelFlashT = 1.6; }
  } else if (shovelFlashT > 0) {
    shovelFlashT -= dt;
    const on = (shovelFlashT * 4 | 0) % 2 === 0;
    setArmorTile(on ? T_STEEL : T_BRICK);
    if (shovelFlashT <= 0) setArmorTile(T_BRICK);
  }

  // спавн врагов
  spawnTimer -= dt;
  if (spawnTimer <= 0 && spawnedCount < queue.length &&
      enemies.length + spawnAnims.length < maxEnemies()) {
    spawnEnemyAnim();
    spawnTimer = clamp(3.2 - stage * 0.15, 1.4, 3.2);
  }
  for (const a of spawnAnims.slice()) {
    a.t += dt;
    if (a.t >= 0.9) {
      const occupied = enemies.some(e => overlap(a.x, a.y, 16, 16, e.x, e.y, 16, 16)) ||
                       (player && !playerDead && overlap(a.x, a.y, 16, 16, player.x, player.y, 16, 16));
      if (!occupied) {
        materializeEnemy(a);
        spawnAnims.splice(spawnAnims.indexOf(a), 1);
      } else a.t = 0.85;
    }
  }

  // игрок
  let playerMoving = false;
  if (playerDead && overSeq < 0) {
    respawnT -= dt;
    if (respawnT <= 0 && lives >= 0) {
      const blocked = enemies.some(e => overlap(64, 192, 16, 16, e.x, e.y, 16, 16));
      if (!blocked) resetPlayer(3);
      else respawnT = 0.3;
    }
  }
  if (player && !playerDead) {
    player.shield -= dt;
    const lastCode = dirStack[dirStack.length - 1];
    const dir = lastCode !== undefined ? CODE2DIR[lastCode] : undefined;
    player.moving = false;
    if (dir !== undefined) {
      if (dir !== player.dir && (dir % 2) !== (player.dir % 2)) {
        // прижать к сетке 8px по перпендикулярной оси
        const sx = dir % 2 === 0 ? Math.round(player.x / SUB) * SUB : player.x;
        const sy = dir % 2 === 1 ? Math.round(player.y / SUB) * SUB : player.y;
        if (terrainFree(sx, sy) && !tanksBlocked(player, sx, sy)) { player.x = sx; player.y = sy; }
      }
      player.dir = dir;
      if (tryMove(player, 52 * dt, dir)) {
        player.moving = true;
        player.anim += dt;
        player.slideDir = dir; player.slideT = 0.25;
      }
    } else if (player.slideT > 0 && onIce(player)) {
      if (tryMove(player, 42 * dt, player.slideDir)) { player.moving = true; player.anim += dt; }
      player.slideT -= dt;
    }
    if (wantFire && playerBulletCount() < (player.level >= 2 ? 2 : 1)) {
      spawnBullet('player', player, player.level >= 1 ? 260 : 170, player.level >= 3 ? 2 : 1);
      sfx.fire();
    }
    if (powerup && overlap(player.x, player.y, 16, 16, powerup.x, powerup.y, 16, 16)) {
      applyPowerup(powerup.kind);
    }
  }
  wantFire = false;

  // враги
  if (freezeT <= 0) {
    for (const e of enemies) {
      e.moveT -= dt;
      if (e.moveT <= 0) { chooseDir(e); e.moveT = rnd(0.8, 2.2); }
      if (tryMove(e, e.speed * dt, e.dir)) { e.anim += dt; e.blockedT = 0; }
      else {
        e.blockedT += dt;
        if (e.blockedT > 0.22) { chooseDir(e); e.blockedT = 0; e.moveT = rnd(0.4, 1.2); }
      }
      e.shootT -= dt;
      if (e.shootT <= 0) {
        if (!enemyBulletCount(e)) spawnBullet('enemy', e, e.bulletSpd, 1);
        e.shootT = e.type === 'power' ? rnd(0.5, 1.2) : rnd(0.9, 2.1);
      }
    }
  }

  // пули
  updateBullets(dt);

  // взрывы / всплывашки
  for (const b of booms.slice()) {
    b.t += dt;
    const dur = b.big ? 0.45 : 0.24;
    if (b.t >= dur) booms.splice(booms.indexOf(b), 1);
  }
  for (const f of floats.slice()) {
    f.t += dt;
    if (f.t >= 0.9) floats.splice(floats.indexOf(f), 1);
  }
  if (powerup) powerup.t += dt;

  // конец игры
  if (overSeq >= 0) {
    overSeq += dt;
    if (overSeq > 3.0) {
      mode = 'over'; overT = 0;
      if (score > hi) { hi = score; saveHi(hi); }
      sfx.over();
    }
    return;
  }

  // этап пройден
  if (!eagleDead && spawnedCount >= queue.length && enemies.length === 0 && spawnAnims.length === 0) {
    if (clearT < 0) clearT = 1.8;
    clearT -= dt;
    if (clearT <= 0) {
      mode = 'score'; scoreScreenT = 0; scoreRow = 0;
    }
  }
  playerMovingNow = playerMoving;
}

function updateBullets(dt) {
  for (const b of bullets.slice()) {
    let rem = b.spd * dt;
    while (rem > 0 && !b.dead) {
      const step = Math.min(2, rem); rem -= step;
      b.x += DX[b.dir] * step; b.y += DY[b.dir] * step;
      // границы
      if (b.x < 0 || b.y < 0 || b.x + 4 > FIELD || b.y + 4 > FIELD) {
        b.dead = true;
        boom(clamp(b.x + 2, 4, FIELD - 4), clamp(b.y + 2, 4, FIELD - 4), false);
        break;
      }
      // местность
      if (bulletTerrain(b)) { b.dead = true; break; }
      // орёл
      if (!eagleDead && overlap(b.x, b.y, 4, 4, EAGLE_X, EAGLE_Y, 16, 16)) {
        b.dead = true; destroyEagle(); break;
      }
      // танки
      if (b.owner === 'player') {
        for (const e of enemies) {
          if (overlap(b.x, b.y, 4, 4, e.x, e.y, 16, 16)) {
            b.dead = true;
            damageEnemy(e);
            break;
          }
        }
      } else {
        if (player && !playerDead && b.from !== player &&
            overlap(b.x, b.y, 4, 4, player.x, player.y, 16, 16)) {
          b.dead = true;
          killPlayer();
        }
        for (const e of enemies) { // дружественный огонь
          if (e !== b.from && overlap(b.x, b.y, 4, 4, e.x, e.y, 16, 16)) {
            b.dead = true; killEnemy(e, false); break;
          }
        }
      }
      if (b.dead) break;
      // пуля против пули (только враждебные)
      for (const o of bullets) {
        if (o !== b && !o.dead && o.owner !== b.owner &&
            overlap(b.x, b.y, 4, 4, o.x, o.y, 4, 4)) {
          b.dead = true; o.dead = true;
          break;
        }
      }
    }
    if (b.dead) bullets.splice(bullets.indexOf(b), 1);
  }
}

function updateScoreScreen(dt) {
  scoreScreenT += dt;
  if (scoreRow < 4) {
    if (scoreScreenT > 0.6) { scoreRow++; scoreScreenT = 0.1; sfx.tick(); }
  } else if (scoreScreenT > 2.0) {
    setupStage(stage + 1);
  }
}

// ---------- Отрисовка ----------
function text(str, x, y, color, size = 8, align = 'left') {
  g.font = size + 'px "Press Start 2P","Courier New",monospace';
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'top';
  g.fillText(str, x, y);
}

function drawTankAt(spr, x, y, dir) {
  g.save();
  g.translate(Math.round(FX + x + 8), Math.round(FY + y + 8));
  g.rotate(dir * Math.PI / 2);
  g.drawImage(spr, -8, -8);
  g.restore();
}
function enemyPalName(e) {
  if (e.flash && (tick / 8 | 0) % 2 === 0) return 'flashA';
  if (e.flash && (tick / 8 | 0) % 2 === 1) return 'flashB';
  if (e.type === 'armor') return 'armor' + clamp(e.hp, 1, 4);
  return e.type;
}

function drawPlayfield() {
  const waterFrame = (time * 2 | 0) % 2;
  // местность (кроме леса)
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const t = terr[tIdx(c, r)];
    if (t === T_EMPTY || t === T_TREES) continue;
    let spr = null;
    if (t === T_BRICK) spr = TILES.brick;
    else if (t === T_STEEL) spr = TILES.steel;
    else if (t === T_WATER) spr = TILES.water[waterFrame];
    else if (t === T_ICE) spr = TILES.ice;
    if (spr) g.drawImage(spr, FX + c * SUB, FY + r * SUB);
  }
  // база
  g.drawImage(eagleDead ? SPR.eagleDead : SPR.eagle, FX + EAGLE_X, FY + EAGLE_Y);

  // звёзды спавна
  for (const a of spawnAnims) {
    const f = (a.t * 10 | 0) % 4;
    const s = [6, 10, 14, 10][f];
    const cx = FX + a.x + 8, cy = FY + a.y + 8;
    g.fillStyle = f % 2 === 0 ? '#F8F8F8' : '#F8B838';
    g.fillRect(cx - s / 2, cy - 1, s, 2);
    g.fillRect(cx - 1, cy - s / 2, 2, s);
    g.fillRect(cx - s / 2, cy - s / 2, 2, 2);
    g.fillRect(cx + s / 2 - 2, cy + s / 2 - 2, 2, 2);
    g.fillRect(cx - s / 2, cy + s / 2 - 2, 2, 2);
    g.fillRect(cx + s / 2 - 2, cy - s / 2, 2, 2);
  }

  // враги
  for (const e of enemies) {
    const frame = (e.anim * 12 | 0) % 2;
    drawTankAt(tankSprite(enemyPalName(e), frame), e.x, e.y, e.dir);
  }
  // игрок
  if (player && !playerDead) {
    const frame = (player.anim * 12 | 0) % 2;
    drawTankAt(tankSprite('player', frame), player.x, player.y, player.dir);
    if (player.shield > 0) {
      const cx = FX + player.x + 8, cy = FY + player.y + 8;
      g.fillStyle = (tick / 4 | 0) % 2 === 0 ? '#78FCFC' : '#F8F8F8';
      for (let i = 0; i < 8; i++) {
        const ang = tick * 0.25 + i * Math.PI / 4;
        g.fillRect(Math.round(cx + Math.cos(ang) * 11), Math.round(cy + Math.sin(ang) * 11), 2, 2);
      }
    }
  }

  // пули
  for (const b of bullets) {
    g.fillStyle = '#000';
    g.fillRect(FX + b.x - 1, FY + b.y - 1, 6, 6);
    g.fillStyle = '#F8F8F8';
    g.fillRect(FX + b.x, FY + b.y, 4, 4);
  }

  // взрывы
  for (const b of booms) {
    const frames = b.big ? BOOM_BIG : BOOM_SMALL;
    const per = b.big ? 0.09 : 0.08;
    const f = Math.min(frames.length - 1, b.t / per | 0);
    for (const [dx, dy, w, h, col] of frames[f]) {
      g.fillStyle = col;
      g.fillRect(FX + b.x + dx, FY + b.y + dy, w, h);
    }
  }

  // лес поверх танков
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (terr[tIdx(c, r)] === T_TREES) g.drawImage(TILES.trees, FX + c * SUB, FY + r * SUB);
  }

  // бонус
  if (powerup && (powerup.t % 0.6) < 0.42) {
    g.drawImage(POWER_SPR[powerup.kind], FX + powerup.x, FY + powerup.y);
  }

  // всплывающие очки
  for (const f of floats) {
    text(f.txt, FX + f.x, FY + f.y - f.t * 8, '#F8F8F8', 8, 'center');
  }
}

function drawMiniTank(x, y, main, dark) {
  g.fillStyle = dark; g.fillRect(x, y + 2, 1, 4); g.fillRect(x + 7, y + 2, 1, 4);
  g.fillStyle = main; g.fillRect(x + 1, y + 2, 6, 4);
  g.fillRect(x + 3, y, 2, 2);
}

function drawSidebar() {
  g.fillStyle = '#636363';
  g.fillRect(FX + FIELD + 6, FY, 26, FIELD);
  const px = FX + FIELD + 6;
  // иконки оставшихся врагов
  const remaining = queue.length - spawnedCount;
  for (let i = 0; i < Math.min(remaining, 16); i++) {
    drawMiniTank(px + 3 + (i % 2) * 12, FY + 14 + Math.floor(i / 2) * 12, '#1A1A1A', '#000');
  }
  // жизни
  text('1P', px + 7, FY + 118, '#000');
  drawMiniTank(px + 3, FY + 132, '#1A1A1A', '#000');
  text('' + Math.max(0, lives), px + 14, FY + 132, '#000');
  // флаг + этап
  const fy = FY + 164;
  g.fillStyle = '#000';
  g.fillRect(px + 11, fy, 2, 16);
  g.fillStyle = '#F8B838';
  g.fillRect(px + 13, fy, 8, 6);
  g.fillStyle = '#000';
  g.fillRect(px + 15, fy + 2, 2, 2);
  text('' + stage, px + 13, fy + 18, '#000', 8, 'left');
}

function drawCurtain() {
  const CLOSE = 0.35, HOLD = 1.3, OPEN = 0.35;
  let p;
  if (introT < CLOSE) p = introT / CLOSE;
  else if (introT < CLOSE + HOLD) p = 1;
  else p = clamp(1 - (introT - CLOSE - HOLD) / OPEN, 0, 1);
  g.fillStyle = '#636363';
  g.fillRect(FX, FY, FIELD, p * 104);
  g.fillRect(FX, FY + FIELD - p * 104, FIELD, p * 104);
  if (p > 0.6) text('STAGE ' + stage, FX + FIELD / 2, FY + 100, '#000', 8, 'center');
}

function drawGameOverSlide() {
  if (overSeq < 0) return;
  const t = clamp(overSeq - 0.8, 0, 1.4) / 1.4;
  const y = 208 - t * 104;
  text('GAME', FX + FIELD / 2, FY + y, '#D83028', 8, 'center');
  text('OVER', FX + FIELD / 2, FY + y + 12, '#D83028', 8, 'center');
}

function drawPause() {
  if ((tick / 16 | 0) % 2 === 0) {
    text('PAUSE', FX + FIELD / 2, FY + 100, '#F8B838', 8, 'center');
  }
}

function drawScoreScreen() {
  text('HI-SCORE', 48, 24, '#D83028', 8);
  text('' + hi, 160, 24, '#D83028', 8, 'right');
  text('STAGE ' + stage, 48, 48, '#F8B838', 8);
  text('1-PLAYER', 48, 72, '#F8F8F8', 8);
  text('' + score, 208, 72, '#F8F8F8', 8, 'right');
  text('PTS', 224, 72, '#F8F8F8', 8);
  const types = ['basic', 'fast', 'power', 'armor'];
  const names = { basic: 100, fast: 200, power: 300, armor: 400 };
  const icons = { basic: '#B0B0B0', fast: '#58B828', power: '#90A8E8', armor: '#28A428' };
  for (let i = 0; i < 4; i++) {
    if (scoreRow <= i) break;
    const y = 104 + i * 24;
    const t = types[i];
    text('' + names[t], 56, y, '#F8F8F8', 8);
    text('' + kills[t] + ' ', 120, y, '#F8F8F8', 8);
    drawMiniTank(146, y, icons[t], '#333');
    if (i === scoreRow - 1 && scoreRow < 5 && scoreScreenT < 0.5) {
      text('<' + kills[t] * names[t] + '>', 200, y, '#F8F8F8', 8, 'right');
    }
  }
  if (scoreRow >= 4) text('TOTAL ' + score, 128, 208, '#F8B838', 8, 'center');
}

function drawOver() {
  text('GAME OVER', 128, 72, '#D83028', 16, 'center');
  text('SCORE ' + score, 128, 112, '#F8F8F8', 8, 'center');
  text('HI-SCORE ' + hi, 128, 128, '#D83028', 8, 'center');
  if ((overT * 2 | 0) % 2 === 0) {
    text('PRESS ENTER', 128, 176, '#F8B838', 8, 'center');
  }
}

function drawTitle() {
  text('HI-SCORE', 128, 16, '#D83028', 8, 'center');
  text('' + hi, 128, 28, '#D83028', 8, 'center');
  text('BATTLE', 130, 52, '#7A1008', 24, 'center');
  text('BATTLE', 128, 50, '#F8B838', 24, 'center');
  text('TANKS', 130, 86, '#7A1008', 24, 'center');
  text('TANKS', 128, 84, '#F8B838', 24, 'center');
  text('NES TRIBUTE', 128, 116, '#909090', 8, 'center');

  // выбор этапа
  text('STAGE', 128, 140, '#F8F8F8', 8, 'center');
  if ((tick / 12 | 0) % 2 === 0) {
    text('< ' + menuStage + ' >', 128, 152, '#F8B838', 8, 'center');
  } else {
    text('  ' + menuStage + '  ', 128, 152, '#F8B838', 8, 'center');
  }
  if ((tick / 16 | 0) % 2 === 0) {
    text('PRESS ENTER', 128, 180, '#F8F8F8', 8, 'center');
  }
  text('WASD/ARROWS MOVE  SPACE FIRE', 128, 204, '#606060', 8, 'center');
  text('P PAUSE   M SOUND', 128, 216, '#606060', 8, 'center');
  // декоративные танки
  const tf = (tick / 12 | 0) % 2;
  drawTankAt(tankSprite('player', tf), 24, 160, 1);
  drawTankAt(tankSprite('basic', tf), 184, 160, 3);
}

// выбор этапа стрелками на титуле
function titleInput() {
  if (mode !== 'title') return;
  const L = keys['ArrowLeft'] || keys['KeyA'], R = keys['ArrowRight'] || keys['KeyD'];
  if (L && !titleInput.hL) { menuStage = menuStage <= 1 ? MAPS.length : menuStage - 1; titleInput.hL = true; }
  if (!L) titleInput.hL = false;
  if (R && !titleInput.hR) { menuStage = menuStage >= MAPS.length ? 1 : menuStage + 1; titleInput.hR = true; }
  if (!R) titleInput.hR = false;
}

function render() {
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 240);
  if (mode === 'title') {
    drawTitle();
    return;
  }
  if (mode === 'score') { drawScoreScreen(); return; }
  if (mode === 'over')  { drawOver(); return; }
  drawPlayfield();
  drawSidebar();
  if (mode === 'intro') drawCurtain();
  if (overSeq >= 0) drawGameOverSlide();
  if (paused) drawPause();
}

// ---------- Главный цикл ----------
let last = 0, acc = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  if (!last) last = ts;
  const dt = Math.min(0.1, (ts - last) / 1000);
  last = ts;
  acc += dt;
  while (acc >= STEP) { titleInput(); update(STEP); acc -= STEP; }
  engineUpdate(mode === 'play' && !paused && playerMovingNow);
  render();
}
requestAnimationFrame(frame);
