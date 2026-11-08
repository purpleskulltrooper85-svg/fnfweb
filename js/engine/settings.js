const KEY = 'fnw-settings';

// Characters offered in Options > Customization > Characters. The ids are the
// data/characters/<id>.json files; the player picks who they play as, and
// (optionally) who the opponent is.
export const CHARACTERS = [
  { id: 'bf', label: 'Boyfriend' },
  { id: 'dad', label: 'Daddy Dearest' },
  { id: 'shaggy', label: 'Shaggy' },
  { id: 'wbshaggy', label: 'Green Shaggy' },
  { id: 'sshaggy', label: 'Super Shaggy' },
  { id: 'rshaggy', label: 'Red Shaggy' },
  { id: 'pshaggy', label: 'Purple Shaggy' },
  { id: 'zshaggy', label: 'Phantom Shaggy' },
  { id: 'spamton', label: 'Spamton Shaggy' },
];

export const STAGES = [
  { id: 'stage', label: 'Stage' },
  { id: 'spooky', label: 'Spooky' },
];

export const DEFAULTS = {
  downscroll: false,
  middlescroll: false,
  ghostTapping: true,
  mobileSupport: 'auto', // 'auto' | 'on' | 'off'
  scrollSpeed: 0, // 0 = use the chart's speed
  rate: 1,
  offset: 0, // ms, positive = notes arrive later
  hitsounds: false,
  showTiming: true,
  showTimer: true,
  botplay: false,
  arrowSkin: 'default',
  player1: 'bf',
  player2: 'dad',
  stage: 'stage',
  keys: [['KeyA', 'ArrowLeft'], ['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp'], ['KeyD', 'ArrowRight']],
};

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...structuredClone(DEFAULTS), ...saved };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export const settings = load();

export function saveSettings() {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

export function laneForCode(code) {
  return settings.keys.findIndex(pair => pair.includes(code));
}

export function keyName(code) {
  if (!code) return '---';
  const arrows = { ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN' };
  if (arrows[code]) return arrows[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
  return code.toUpperCase();
}
