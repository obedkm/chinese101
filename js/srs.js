// State store (localStorage) + spaced-repetition engine
window.Store = (() => {
  const KEY = 'mj_state_v1';
  const DEFAULT = {
    settings: { dailyGoal: 2 },
    lessons: {},      // 'u1:0' -> completion timestamp
    daily: {},        // '2026-07-04' -> sessions finished that day
    words: {},        // wordId -> {box, due, right, wrong}
    hanzi: {},        // char -> true once learned
    skills: { vocab: 0, hanzi: 0, grammar: 0, listening: 0, speaking: 0 },
    stageUnlocked: {},  // 'hsk3': true — unlocked by passing a test-out quiz
    bestStreak: 0,
  };

  let data;
  try { data = Object.assign({}, DEFAULT, JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch (e) { data = JSON.parse(JSON.stringify(DEFAULT)); }
  data.settings = Object.assign({}, DEFAULT.settings, data.settings);
  data.skills = Object.assign({}, DEFAULT.skills, data.skills);

  const save = () => localStorage.setItem(KEY, JSON.stringify(data));
  const reset = () => { localStorage.removeItem(KEY); location.reload(); };
  return { data, save, reset };
})();

window.SRS = (() => {
  const INTERVALS = [0, 1, 3, 7, 14, 30]; // days per box
  const D = Store.data;

  const todayStr = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  // Record an answer about a word (from any exercise type)
  function record(wordId, correct) {
    let w = D.words[wordId];
    if (!w) w = D.words[wordId] = { box: 0, due: todayStr(), right: 0, wrong: 0 };
    if (correct) { w.right++; w.box = Math.min(5, w.box + 1); }
    else { w.wrong++; w.box = Math.max(1, w.box - 1); }
    w.due = todayStr(INTERVALS[w.box]);
    Store.save();
  }

  const stage = (w) => !w || w.box === 0 ? 'new' : w.box <= 2 ? 'learning' : w.box <= 4 ? 'known' : 'mastered';

  function counts() {
    const c = { learning: 0, known: 0, mastered: 0 };
    for (const id in D.words) { const s = stage(D.words[id]); if (c[s] !== undefined) c[s]++; }
    c.total = c.learning + c.known + c.mastered;
    return c;
  }

  const dueWords = () => Object.keys(D.words).filter(id => D.words[id].box >= 1 && D.words[id].due <= todayStr());

  // ---- habit / streak ----
  function bumpToday() {
    const t = todayStr();
    D.daily[t] = (D.daily[t] || 0) + 1;
    const s = streak();
    if (s > D.bestStreak) D.bestStreak = s;
    Store.save();
  }

  function streak() {
    let s = 0;
    // today counts if active; otherwise the streak is still alive until midnight
    for (let i = (D.daily[todayStr()] ? 0 : 1); ; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      if (D.daily[key]) s++; else break;
    }
    return s;
  }

  const doneToday = () => D.daily[todayStr()] || 0;

  function lastNDays(n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      out.push({ date: key, day: d.getDate(), count: Store.data.daily[key] || 0 });
    }
    return out;
  }

  return { record, stage, counts, dueWords, bumpToday, streak, doneToday, lastNDays, todayStr };
})();
