// Speech layer — Web Speech API on desktop/browser, window.MJBridge (native Android) in the APK
window.Speech = (() => {
  let voice = null;

  function pickVoice() {
    if (!window.speechSynthesis) return;
    const voices = speechSynthesis.getVoices();
    // Prefer a mainland-Chinese voice, then any zh voice
    voice = voices.find(v => /zh[-_]CN/i.test(v.lang)) ||
            voices.find(v => /^zh/i.test(v.lang)) || null;
  }
  if (window.speechSynthesis) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }

  function speak(text, rate = 0.8) {
    if (window.MJBridge && MJBridge.speak) { MJBridge.speak(text, rate); return; }
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    if (voice) u.voice = voice;
    u.rate = rate;
    speechSynthesis.speak(u);
  }

  function canListen() {
    return !!(window.MJBridge && MJBridge.startListening) ||
           !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  // cb(transcript|null, errorMessage|null); onEnd() always fires when the mic closes
  function listen(cb, onEnd) {
    if (window.MJBridge && MJBridge.startListening) {
      window._mjOnSpeech = (text) => { cb(text || null, text ? null : 'No speech detected'); onEnd(); };
      MJBridge.startListening('zh-CN');
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { cb(null, 'Speech recognition not supported here'); onEnd(); return; }
    const rec = new SR();
    rec.lang = 'zh-CN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let got = false;
    rec.onresult = (e) => { got = true; cb(e.results[0][0].transcript, null); };
    rec.onerror = (e) => { got = true; cb(null, e.error === 'not-allowed' ? 'Microphone access denied' : 'Could not hear you (' + e.error + ')'); };
    rec.onend = () => { if (!got) cb(null, 'No speech detected'); onEnd(); };
    try { rec.start(); } catch (e) { cb(null, 'Mic unavailable'); onEnd(); }
  }

  return { speak, canListen, listen };
})();

// Pinyin helpers — tone-insensitive comparison for typed answers
window.Pinyin = (() => {
  const MAP = {
    'ā':'a','á':'a','ǎ':'a','à':'a', 'ē':'e','é':'e','ě':'e','è':'e',
    'ī':'i','í':'i','ǐ':'i','ì':'i', 'ō':'o','ó':'o','ǒ':'o','ò':'o',
    'ū':'u','ú':'u','ǔ':'u','ù':'u', 'ǖ':'v','ǘ':'v','ǚ':'v','ǜ':'v','ü':'v',
  };
  function normalize(s) {
    return (s || '').toLowerCase()
      .replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/g, ch => MAP[ch])
      .replace(/[^a-z]/g, ''); // drop spaces, tone numbers, apostrophes, punctuation
  }
  return { normalize, matches: (typed, target) => normalize(typed) === normalize(target) };
})();
