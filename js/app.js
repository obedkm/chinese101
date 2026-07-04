// Mandarin Journey — UI screens + lesson player + exercise engines
(() => {
const $ = (sel, el = document) => el.querySelector(sel);
const D = Store.data;

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sample = (arr, n) => shuffle(arr).slice(0, n);
const hanChars = (s) => (s || '').replace(/10/g, '十').replace(/[0-9]/g, d => '〇一二三四五六七八九'[+d]).replace(/[^一-鿿]/g, '');

const soundBtn = (text, big) => `<button class="sound-btn ${big ? 'sound-big' : ''}" data-say="${esc(text)}">🔊</button>`;
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-say]');
  if (b) Speech.speak(b.dataset.say);
});

// ---------------------------------------------------------------- lesson access
const lessonKey = (unitIdx, li) => UNITS[unitIdx].id + ':' + li;
const lessonDone = (unitIdx, li) => !!D.lessons[lessonKey(unitIdx, li)];
const unitUnlocked = (unitIdx) => !UNITS[unitIdx].comingSoon && (unitIdx === 0 || lessonDone(unitIdx - 1, 5));
const lessonUnlocked = (unitIdx, li) => unitUnlocked(unitIdx) && (li === 0 || lessonDone(unitIdx, li - 1));

function nextLesson() {
  for (let u = 0; u < UNITS.length; u++) {
    if (UNITS[u].comingSoon) continue;
    for (let li = 0; li < 6; li++) if (!lessonDone(u, li)) return { u, li };
  }
  return null;
}

// ---------------------------------------------------------------- exercise builders
// Every exercise: { skill, render(el, api) }.
// api.answer(correct, correctText) -> feedback + Continue; api.ready() -> info card, Continue enabled.

function exIntroWord(wordId) {
  const w = WORDS[wordId];
  return { skill: 'vocab', info: true, render(el, api) {
    el.innerHTML = `<p class="ex-prompt">New word</p>
      <div class="word-card">
        <div class="word-emoji">${w.emoji}</div>
        <div class="hanzi-big">${esc(w.cn)}</div>
        <div class="pinyin">${esc(w.py)}</div>
        <div class="meaning">${esc(w.en)}</div>
        ${soundBtn(w.cn, true)}
      </div>`;
    Speech.speak(w.cn);
    api.ready();
  } };
}

function exChoice(promptHTML, choices, correctText, opts = {}) {
  return { skill: opts.skill || 'vocab', render(el, api) {
    el.innerHTML = `${promptHTML}<div class="choices">${shuffle(choices).map(c =>
      `<button class="choice" data-ok="${c.ok ? 1 : 0}">${esc(c.label)}</button>`).join('')}</div>`;
    if (opts.autoPlay) setTimeout(() => Speech.speak(opts.autoPlay), 350);
    el.querySelectorAll('.choice').forEach(btn => btn.onclick = () => {
      if (el.dataset.answered) return;
      el.dataset.answered = '1';
      const ok = btn.dataset.ok === '1';
      btn.classList.add(ok ? 'correct' : 'wrong');
      if (!ok) el.querySelectorAll('.choice').forEach(b => { if (b.dataset.ok === '1') b.classList.add('correct'); });
      if (opts.wordId) SRS.record(opts.wordId, ok);
      if (opts.sayOnAnswer) Speech.speak(opts.sayOnAnswer);
      api.answer(ok, correctText);
    });
  } };
}

const wordEnChoices = (wordId, pool) => {
  const others = sample(pool.filter(id => id !== wordId && WORDS[id].en !== WORDS[wordId].en), 3);
  return [{ label: WORDS[wordId].en, ok: true }, ...others.map(id => ({ label: WORDS[id].en, ok: false }))];
};

function exWordMC(wordId, pool) {
  const w = WORDS[wordId];
  return exChoice(
    `<p class="ex-prompt">What does this mean?</p><div class="prompt-hanzi">${esc(w.cn)} ${soundBtn(w.cn)}</div><div class="prompt-sub">${esc(w.py)}</div>`,
    wordEnChoices(wordId, pool), w.en, { wordId, skill: 'vocab' });
}

function exAudioMC(wordId, pool) {
  const w = WORDS[wordId];
  return exChoice(
    `<p class="ex-prompt">What do you hear?</p><div class="audio-prompt">${soundBtn(w.cn, true)}</div>`,
    wordEnChoices(wordId, pool), `${w.cn} ${w.py} — ${w.en}`, { wordId, skill: 'listening', autoPlay: w.cn });
}

function exReverseMC(wordId, pool) {
  const w = WORDS[wordId];
  const others = sample(pool.filter(id => id !== wordId && WORDS[id].cn !== w.cn), 3);
  return exChoice(
    `<p class="ex-prompt">Which one means <b>“${esc(w.en)}”</b>?</p>`,
    [{ label: w.cn, ok: true }, ...others.map(id => ({ label: WORDS[id].cn, ok: false }))],
    `${w.cn} ${w.py}`, { wordId, skill: 'vocab', sayOnAnswer: w.cn });
}

function exPinyinType(wordId) {
  const w = WORDS[wordId];
  return { skill: 'vocab', render(el, api) {
    el.innerHTML = `<p class="ex-prompt">Type the pinyin (tones optional)</p>
      <div class="prompt-hanzi">${esc(w.cn)} ${soundBtn(w.cn)}</div>
      <input class="pinyin-input" type="text" autocomplete="off" autocapitalize="none" placeholder="e.g. nihao">
      <button class="btn inline-check">Check</button>`;
    const input = $('.pinyin-input', el);
    const submit = () => {
      if (el.dataset.answered || !input.value.trim()) return;
      el.dataset.answered = '1';
      const ok = Pinyin.matches(input.value, w.pyPlain);
      input.classList.add(ok ? 'good' : 'bad');
      SRS.record(wordId, ok);
      api.answer(ok, `${w.cn} = ${w.py}`);
    };
    $('.inline-check', el).onclick = submit;
    input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    setTimeout(() => input.focus(), 100);
  } };
}

function exSentenceAudioMC(sentence, unit) {
  const pool = unit.sentences.filter(s => s.en !== sentence.en).map(s => s.en);
  const choices = [{ label: sentence.en, ok: true }, ...sample(pool, 3).map(en => ({ label: en, ok: false }))];
  return exChoice(
    `<p class="ex-prompt">Listen — what does it mean?</p><div class="audio-prompt">${soundBtn(sentence.cn, true)}</div>`,
    choices, `${sentence.cn} — ${sentence.en}`, { skill: 'listening', autoPlay: sentence.cn });
}

function exFillBlank(fb) {
  return exChoice(
    `<p class="ex-prompt">Fill the blank</p>
     <div class="prompt-hanzi">${esc(fb.before)}<span class="blank"></span>${esc(fb.after)}</div>
     <div class="prompt-sub">“${esc(fb.en)}”</div>`,
    fb.choices.map(c => ({ label: c, ok: c === fb.answer })),
    `${fb.before}${fb.answer}${fb.after}`, { skill: 'grammar', sayOnAnswer: fb.before + fb.answer + fb.after });
}

function exTiles(t) {
  return { skill: 'grammar', render(el, api) {
    el.innerHTML = `<p class="ex-prompt">Build the sentence: <b>“${esc(t.en)}”</b></p>
      <div class="answer-line"></div><div class="tile-bank"></div><button class="btn inline-check">Check</button>`;
    const line = $('.answer-line', el), bank = $('.tile-bank', el);
    shuffle(t.parts.map((p, i) => ({ p, i }))).forEach(({ p }) => {
      const tile = document.createElement('button');
      tile.className = 'tile'; tile.textContent = p;
      tile.onclick = () => { (tile.parentNode === bank ? line : bank).appendChild(tile); };
      bank.appendChild(tile);
    });
    $('.inline-check', el).onclick = () => {
      if (el.dataset.answered) return;
      const built = [...line.children].map(c => c.textContent).join('');
      if (!built) return;
      el.dataset.answered = '1';
      const ok = built === t.parts.join('');
      Speech.speak(t.parts.join(''));
      api.answer(ok, t.parts.join('') + ' — ' + t.en);
    };
  } };
}

function exGrammarIntro(g) {
  return { skill: 'grammar', info: true, render(el, api) {
    el.innerHTML = `<p class="ex-prompt">Grammar bite</p>
      <div class="grammar-card"><h3>${esc(g.name)}</h3><p>${g.intro}</p>
      ${g.examples.map(ex => `<div class="example"><div class="ex-cn">${esc(ex.cn)} ${soundBtn(ex.cn)}</div><div class="ex-py">${esc(ex.py)}</div><div class="ex-en">${esc(ex.en)}</div></div>`).join('')}
      </div>`;
    api.ready();
  } };
}

function exHanziLearn(char) {
  const wordId = Object.keys(WORDS).find(id => WORDS[id].cn.length > 1 && WORDS[id].cn.includes(char)) ||
                 Object.keys(WORDS).find(id => WORDS[id].cn === char);
  const w = wordId ? WORDS[wordId] : null;
  return { skill: 'hanzi', info: true, render(el, api) {
    el.innerHTML = `<p class="ex-prompt">New character — watch the strokes</p>
      <div class="hz-wrap"><div class="hz-target" id="hz-learn"></div></div>
      <div class="hz-info">${w ? `<span class="hz-big">${esc(char)}</span> ${w.cn === char ? '' : `as in <b>${esc(w.cn)}</b> `}${esc(w.py)} — ${esc(w.en)}` : esc(char)} ${soundBtn(char)}</div>
      <button class="btn btn-ghost" id="hz-replay">▶ Replay strokes</button>`;
    if (window.HANZI_DATA && HANZI_DATA[char]) {
      const writer = HanziWriter.create($('#hz-learn', el), char, {
        width: 200, height: 200, padding: 8, strokeAnimationSpeed: 1, delayBetweenStrokes: 250,
        strokeColor: '#2d2a26', outlineColor: '#eadfce', showOutline: true,
        charDataLoader: (c, onLoad) => onLoad(HANZI_DATA[c]),
      });
      const play = () => writer.animateCharacter();
      setTimeout(play, 400);
      $('#hz-replay', el).onclick = play;
    }
    api.ready();
  } };
}

function exHanziQuiz(char) {
  return { skill: 'hanzi', render(el, api) {
    el.innerHTML = `<p class="ex-prompt">Your turn — trace <b>${esc(char)}</b> stroke by stroke</p>
      <div class="hz-wrap"><div class="hz-target" id="hz-quiz"></div></div>
      <div class="hz-status" id="hz-status">Draw the first stroke</div>`;
    if (!(window.HANZI_DATA && HANZI_DATA[char])) { api.answer(true, char); return; }
    const writer = HanziWriter.create($('#hz-quiz', el), char, {
      width: 240, height: 240, padding: 10, showCharacter: false, showOutline: true,
      strokeColor: '#2d2a26', outlineColor: '#eadfce', drawingColor: '#d64541', drawingWidth: 20,
      charDataLoader: (c, onLoad) => onLoad(HANZI_DATA[c]),
    });
    writer.quiz({
      onMistake: () => { $('#hz-status', el).textContent = 'Almost — try that stroke again'; },
      onCorrectStroke: (s) => { $('#hz-status', el).textContent = `Stroke ${s.strokeNum + 1} ✓`; },
      onComplete: (summary) => {
        D.hanzi[char] = true; Store.save();
        const ok = summary.totalMistakes <= 5;
        $('#hz-status', el).textContent = ok ? 'Beautiful! ✨' : 'Done — keep practicing this one';
        api.answer(ok, char);
      },
    });
  } };
}

function exSpeak(sentence) {
  return { skill: 'speaking', render(el, api) {
    const supported = Speech.canListen();
    el.innerHTML = `<p class="ex-prompt">Say it out loud</p>
      <div class="prompt-hanzi">${esc(sentence.cn)} ${soundBtn(sentence.cn)}</div>
      <div class="prompt-sub">${esc(sentence.py)} — “${esc(sentence.en)}”</div>
      <button class="mic-btn" id="mic" ${supported ? '' : 'disabled'}>🎤</button>
      <div class="transcript" id="transcript">${supported ? 'Tap the mic, then speak' : 'Speech recognition not available here — use the APK or Chrome'}</div>
      <button class="btn btn-ghost" id="speak-skip">Skip</button>`;
    const mic = $('#mic', el), out = $('#transcript', el);
    $('#speak-skip', el).onclick = () => { if (!el.dataset.answered) { el.dataset.answered = '1'; api.answer(null); } };
    if (!supported) return;
    mic.onclick = () => {
      if (el.dataset.answered) return;
      mic.classList.add('listening'); out.textContent = 'Listening… 说吧!';
      Speech.listen((text, err) => {
        if (err) { out.textContent = err + ' — tap to retry'; return; }
        const target = hanChars(sentence.cn), heard = hanChars(text);
        let hit = 0; const bag = heard.split('');
        for (const ch of target) { const i = bag.indexOf(ch); if (i >= 0) { hit++; bag.splice(i, 1); } }
        const score = target.length ? hit / target.length : 0;
        out.innerHTML = `You said: <b>${esc(text)}</b>`;
        if (score >= 0.6) { el.dataset.answered = '1'; api.answer(true, sentence.cn); }
        else out.innerHTML += ' — quite close, tap the mic to try again';
      }, () => mic.classList.remove('listening'));
    };
  } };
}

// ---------------------------------------------------------------- lesson assembly
function buildLesson(unit, li) {
  const type = LESSON_TYPES[li].key;
  const ex = [];
  if (type === 'vocab') {
    unit.words.forEach(id => ex.push(exIntroWord(id)));
    sample(unit.words, Math.min(8, unit.words.length)).forEach(id => ex.push(exWordMC(id, unit.words)));
    sample(unit.words, 2).forEach(id => ex.push(exPinyinType(id)));
  } else if (type === 'hanzi') {
    unit.hanzi.forEach(c => { ex.push(exHanziLearn(c)); ex.push(exHanziQuiz(c)); });
  } else if (type === 'grammar') {
    ex.push(exGrammarIntro(unit.grammar));
    unit.grammar.fillBlanks.forEach(fb => ex.push(exFillBlank(fb)));
    unit.grammar.tiles.forEach(t => ex.push(exTiles(t)));
  } else if (type === 'listening') {
    unit.sentences.forEach(s => ex.push(exSentenceAudioMC(s, unit)));
    sample(unit.words, 3).forEach(id => ex.push(exAudioMC(id, unit.words)));
  } else if (type === 'speaking') {
    unit.sentences.forEach(s => ex.push(exSpeak(s)));
  } else if (type === 'checkpoint') {
    sample(unit.words, 3).forEach(id => ex.push(exWordMC(id, unit.words)));
    sample(unit.words, 2).forEach(id => ex.push(exReverseMC(id, unit.words)));
    ex.push(exFillBlank(sample(unit.grammar.fillBlanks, 1)[0]));
    ex.push(exTiles(sample(unit.grammar.tiles, 1)[0]));
    ex.push(exSentenceAudioMC(sample(unit.sentences, 1)[0], unit));
    sample(unit.words, 1).forEach(id => ex.push(exPinyinType(id)));
  }
  return ex;
}

function buildReview(dueIds) {
  const pool = Object.keys(WORDS).filter(id => D.words[id]);
  return sample(dueIds, 12).map(id => {
    const kind = Math.floor(Math.random() * 4);
    if (kind === 0) return exWordMC(id, pool);
    if (kind === 1) return exReverseMC(id, pool);
    if (kind === 2) return exAudioMC(id, pool);
    return exPinyinType(id);
  });
}

// ---------------------------------------------------------------- player
function runSession({ title, exercises, onPass, isCheckpoint }) {
  const player = $('#player');
  player.classList.remove('hidden');
  let idx = 0, correct = 0, answerable = 0;
  exercises.forEach(e => { if (!e.info) answerable++; });

  function close() { player.classList.add('hidden'); player.innerHTML = ''; renderScreen(); }

  function showExercise() {
    if (idx >= exercises.length) return showResult();
    const ex = exercises[idx];
    player.innerHTML = `
      <div class="player-top">
        <button class="quit-btn" id="quit">✕</button>
        <div class="player-progress"><div class="player-progress-fill" style="width:${(idx / exercises.length) * 100}%"></div></div>
      </div>
      <div class="ex-area" id="ex-area"></div>
      <div class="feedback hidden" id="feedback"></div>
      <div class="player-footer"><button class="btn btn-primary hidden" id="continue">Continue</button></div>`;
    $('#quit').onclick = () => { if (confirm('Quit this lesson? Progress in it will be lost.')) close(); };
    const contBtn = $('#continue');
    const api = {
      ready() { contBtn.classList.remove('hidden'); },
      answer(ok, correctText) {
        if (ok !== null) {
          if (ok) correct++;
          const fb = $('#feedback');
          fb.className = 'feedback ' + (ok ? 'good' : 'bad');
          fb.innerHTML = ok ? `<b>正确! Correct!</b>${correctText ? ' · ' + esc(correctText) : ''}`
                            : `<b>Not quite.</b> ${correctText ? 'Answer: ' + esc(correctText) : ''}`;
        }
        contBtn.classList.remove('hidden');
        contBtn.focus();
      },
    };
    contBtn.onclick = () => { idx++; showExercise(); };
    ex.render($('#ex-area'), api);
  }

  function showResult() {
    const acc = answerable ? correct / answerable : 1;
    const passed = !isCheckpoint || acc >= 0.7;
    if (passed) onPass();
    const goal = D.settings.dailyGoal, done = SRS.doneToday();
    player.innerHTML = `<div class="result">
      <div class="result-emoji">${passed ? '🎉' : '💪'}</div>
      <h2>${passed ? '太好了! Well done!' : 'Almost there'}</h2>
      <p class="result-title">${esc(title)}</p>
      ${answerable ? `<p class="result-acc">${correct} / ${answerable} correct (${Math.round(acc * 100)}%)</p>` : ''}
      ${passed
        ? (done >= goal ? `<p class="result-goal">🔥 Daily goal reached — streak: ${SRS.streak()} day${SRS.streak() === 1 ? '' : 's'}</p>`
                        : `<p class="result-goal">${done} / ${goal} sessions today — keep going!</p>`)
        : '<p class="result-goal">You need 70% to pass the checkpoint. Review the unit and try again!</p>'}
      <button class="btn btn-primary" id="result-close">Continue</button>
    </div>`;
    $('#result-close').onclick = close;
  }
  showExercise();
}

function startLesson(unitIdx, li) {
  const unit = UNITS[unitIdx];
  const t = LESSON_TYPES[li];
  runSession({
    title: `${unit.title} · ${t.name}`,
    exercises: buildLesson(unit, li),
    isCheckpoint: t.key === 'checkpoint',
    onPass() {
      const first = !D.lessons[lessonKey(unitIdx, li)];
      D.lessons[lessonKey(unitIdx, li)] = Date.now();
      if (first && D.skills[t.key] !== undefined) D.skills[t.key]++;
      SRS.bumpToday();
      Store.save();
    },
  });
}

function startReview() {
  const due = SRS.dueWords();
  if (!due.length) return;
  runSession({ title: 'Daily review', exercises: buildReview(due), onPass() { SRS.bumpToday(); } });
}

// ---------------------------------------------------------------- screens
function renderHome(el) {
  const goal = D.settings.dailyGoal, done = SRS.doneToday(), streak = SRS.streak();
  const nxt = nextLesson();
  const due = SRS.dueWords().length;
  const wc = SRS.counts();
  const pct = Math.min(1, done / goal);
  const ring = 2 * Math.PI * 34;
  const week = SRS.lastNDays(7);
  const max = Math.max(goal, ...week.map(d => d.count));
  el.innerHTML = `
    <header class="home-header">
      <div><h1>你好! 👋</h1><p class="subtitle">Small steps every day</p></div>
      <div class="streak-badge">🔥<b>${streak}</b></div>
    </header>
    <div class="card today-card">
      <div class="goal-wrap">
        <svg viewBox="0 0 80 80" class="goal-ring">
          <circle cx="40" cy="40" r="34" class="ring-bg"/>
          <circle cx="40" cy="40" r="34" class="ring-fg" stroke-dasharray="${ring}" stroke-dashoffset="${ring * (1 - pct)}"/>
        </svg>
        <div class="goal-num">${done}<span>/${goal}</span></div>
      </div>
      <div class="today-info">
        <h2>${done >= goal ? 'Goal reached! 🎊' : 'Today’s goal'}</h2>
        <p>${done >= goal ? 'Extra practice makes it stick.' : `${goal - done} more session${goal - done === 1 ? '' : 's'} to keep the streak.`}</p>
      </div>
    </div>
    ${nxt ? `<button class="big-btn" id="continue-journey">
        <span class="big-btn-icon">${LESSON_TYPES[nxt.li].icon}</span>
        <span class="big-btn-text"><b>Continue journey</b><small>${esc(UNITS[nxt.u].title)} · ${LESSON_TYPES[nxt.li].name}</small></span>
        <span class="big-btn-arrow">›</span>
      </button>`
      : '<div class="card">🏆 You finished all available lessons! More units coming in the next update.</div>'}
    <button class="big-btn big-btn-alt" id="start-review" ${due ? '' : 'disabled'}>
      <span class="big-btn-icon">🔁</span>
      <span class="big-btn-text"><b>Review</b><small>${due ? `${due} word${due === 1 ? '' : 's'} due today` : 'Nothing due — nice and tidy'}</small></span>
      <span class="big-btn-arrow">›</span>
    </button>
    <div class="card">
      <div class="card-row"><span>📖 Words I know</span><b>${wc.known + wc.mastered}</b></div>
      <div class="mini-chart">${week.map(d => `<div class="mini-col"><div class="mini-bar ${d.count >= goal ? 'hit' : ''}" style="height:${max ? Math.max(4, (d.count / max) * 44) : 4}px"></div><span>${'SMTWTFS'[new Date(d.date + 'T12:00').getDay()]}</span></div>`).join('')}</div>
    </div>`;
  const cj = $('#continue-journey', el);
  if (cj) cj.onclick = () => startLesson(nxt.u, nxt.li);
  $('#start-review', el).onclick = startReview;
}

function renderJourney(el) {
  el.innerHTML = `<header class="screen-header"><h1>🗺️ Journey</h1><p class="subtitle">HSK 1 → HSK 2 · one small stop at a time</p></header>` +
    UNITS.map((u, ui) => {
      if (u.comingSoon) return `<div class="unit-card unit-coming"><div class="unit-head"><span class="unit-icon">${u.icon}</span><div><h3>${esc(u.title)}</h3><p>Coming soon</p></div><span class="lock">🔒</span></div></div>`;
      const unlocked = unitUnlocked(ui);
      const doneCount = [0, 1, 2, 3, 4, 5].filter(li => lessonDone(ui, li)).length;
      return `<div class="unit-card ${unlocked ? '' : 'unit-locked'}">
        <div class="unit-head"><span class="unit-icon">${u.icon}</span>
          <div><h3>${esc(u.title)}</h3><p>HSK ${u.hsk} · ${doneCount}/6 lessons</p></div>
          ${unlocked ? '' : '<span class="lock">🔒</span>'}</div>
        <div class="lesson-nodes">${LESSON_TYPES.map((t, li) => {
          const done = lessonDone(ui, li);
          const canDo = lessonUnlocked(ui, li);
          const current = canDo && !done;
          return `<button class="node ${done ? 'done' : ''} ${current ? 'current' : ''} ${canDo || done ? '' : 'locked'}"
            data-u="${ui}" data-li="${li}" ${canDo || done ? '' : 'disabled'} title="${t.name}">
            <span>${done ? '✓' : t.icon}</span><small>${t.name}</small></button>`;
        }).join('')}</div>
      </div>`;
    }).join('');
  el.querySelectorAll('.node:not(.locked)').forEach(n => n.onclick = () => startLesson(+n.dataset.u, +n.dataset.li));
}

function renderProgress(el) {
  const wc = SRS.counts();
  const totalWords = Object.keys(WORDS).length;
  const hanziCount = Object.keys(D.hanzi).length;
  const totalLessons = Object.keys(D.lessons).length;
  const unitsDone = UNITS.filter((u, ui) => !u.comingSoon && lessonDone(ui, 5)).length;
  const days = SRS.lastNDays(30);
  const goal = D.settings.dailyGoal;
  const max = Math.max(goal, ...days.map(d => d.count));
  const skillMax = Math.max(1, ...Object.values(D.skills));
  const stageBar = (label, n, cls) => `<div class="bar-row"><span class="bar-label">${label}</span><div class="bar-track"><div class="bar-fill ${cls}" style="width:${wc.total ? (n / Math.max(1, wc.total)) * 100 : 0}%"></div></div><b>${n}</b></div>`;
  el.innerHTML = `
    <header class="screen-header"><h1>📊 Progress</h1><p class="subtitle">Proof of your small habits</p></header>
    <div class="card words-known-card">
      <div class="wk-num">${wc.known + wc.mastered}</div>
      <div class="wk-label">words I know <span>of ${totalWords} in the course</span></div>
      ${stageBar('Learning', wc.learning, 'st-learning')}
      ${stageBar('Known', wc.known, 'st-known')}
      ${stageBar('Mastered', wc.mastered, 'st-mastered')}
    </div>
    <div class="card">
      <h3 class="card-title">Sessions per day — last 30 days</h3>
      <div class="chart">
        <div class="goal-line" style="bottom:${(goal / max) * 100}%"><span>goal ${goal}</span></div>
        ${days.map(d => `<div class="chart-bar ${d.count >= goal ? 'hit' : ''}" style="height:${max ? Math.max(2, (d.count / max) * 100) : 2}%" title="${d.date}: ${d.count}"></div>`).join('')}
      </div>
    </div>
    <div class="stat-grid">
      <div class="stat"><b>🔥 ${SRS.streak()}</b><span>day streak</span></div>
      <div class="stat"><b>🏅 ${D.bestStreak}</b><span>best streak</span></div>
      <div class="stat"><b>📚 ${totalLessons}</b><span>lessons done</span></div>
      <div class="stat"><b>✍️ ${hanziCount}</b><span>hanzi learned</span></div>
      <div class="stat"><b>🚩 ${unitsDone}</b><span>units finished</span></div>
      <div class="stat"><b>🈶 ${wc.total}</b><span>words started</span></div>
    </div>
    <div class="card">
      <h3 class="card-title">Skill balance</h3>
      ${LESSON_TYPES.slice(0, 5).map(t => `<div class="bar-row"><span class="bar-label">${t.icon} ${t.name}</span><div class="bar-track"><div class="bar-fill st-known" style="width:${(D.skills[t.key] / skillMax) * 100}%"></div></div><b>${D.skills[t.key]}</b></div>`).join('')}
    </div>`;
}

function renderSettings(el) {
  el.innerHTML = `
    <header class="screen-header"><h1>⚙️ Settings</h1></header>
    <div class="card">
      <label class="setting-row">Daily goal
        <select id="goal-select">${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${D.settings.dailyGoal === n ? 'selected' : ''}>${n} session${n > 1 ? 's' : ''}/day</option>`).join('')}</select>
      </label>
    </div>
    <div class="card">
      <div class="setting-row">Chinese audio <button class="btn btn-ghost" id="test-audio">🔊 Test</button></div>
      <div class="setting-row">Speech recognition <b>${Speech.canListen() ? '✅ available' : '❌ not available'}</b></div>
    </div>
    <div class="card">
      <button class="btn btn-danger" id="reset-all">Reset all progress</button>
    </div>
    <p class="version">Mandarin Journey v0.2 · HSK 1 + 2 · 30 units</p>`;
  $('#goal-select', el).onchange = (e) => { D.settings.dailyGoal = +e.target.value; Store.save(); };
  $('#test-audio', el).onclick = () => Speech.speak('你好！我们一起学中文吧。');
  $('#reset-all', el).onclick = () => { if (confirm('Delete ALL progress? This cannot be undone.')) Store.reset(); };
}

// ---------------------------------------------------------------- nav
let currentScreen = 'home';
const SCREENS = { home: renderHome, journey: renderJourney, progress: renderProgress, settings: renderSettings };

function renderScreen() {
  const el = $('#screen');
  el.innerHTML = '';
  SCREENS[currentScreen](el);
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.screen === currentScreen));
}

document.querySelectorAll('.nav-btn').forEach(b => b.onclick = () => { currentScreen = b.dataset.screen; renderScreen(); });
renderScreen();
})();
