const KEY = 'fnw-settings';

export const DEFAULTS = {
  downscroll: false,
  middlescroll: false,
  ghostTapping: true,
  scrollSpeed: 0, // 0 = use the chart's speed
  rate: 1,
  offset: 0, // ms, positive = notes arrive later
  hitsounds: false,
  showTiming: true,
  botplay: false,
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
