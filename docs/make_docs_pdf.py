# Generates docs/BUILD.pdf for the Mandarin Journey repo
import re, html
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Table, TableStyle, PageBreak, KeepTogether)
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon

PROJECT = Path.home() / "Documents/project/mandarin-journey"
OUT = PROJECT / "docs" / "BUILD.pdf"
OUT.parent.mkdir(exist_ok=True)

pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))

RED, DARKRED, GOLD = colors.HexColor("#d64541"), colors.HexColor("#b93733"), colors.HexColor("#e8b04b")
INK, MUTED, BGSOFT = colors.HexColor("#2d2a26"), colors.HexColor("#8a8177"), colors.HexColor("#faf3ea")
LINEC = colors.HexColor("#ede4d7")

# CJK plus pinyin tone-marked Latin (Courier/Helvetica lack those glyphs; the CID font has them)
CJK = re.compile(r'([　-鿿＀-￯‘’“”…、。！？·āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüĀÁǍÀĒÉĚÈ≥→]+)')
def cn(text):
    """Escape text and wrap CJK runs in the CID font so Chinese renders."""
    return CJK.sub(r'<font name="STSong-Light">\1</font>', html.escape(text))

S = {
    "title":   ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=30, leading=36, textColor=INK, alignment=TA_CENTER),
    "subtitle":ParagraphStyle("subtitle", fontName="STSong-Light", fontSize=20, leading=26, textColor=RED, alignment=TA_CENTER),
    "coverinfo":ParagraphStyle("coverinfo", fontName="Helvetica", fontSize=11, leading=16, textColor=MUTED, alignment=TA_CENTER),
    "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=17, leading=22, textColor=DARKRED, spaceBefore=18, spaceAfter=8),
    "h2": ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=12.5, leading=16, textColor=INK, spaceBefore=12, spaceAfter=5),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=9.8, leading=14.5, textColor=INK, spaceAfter=6),
    "bullet": ParagraphStyle("bullet", fontName="Helvetica", fontSize=9.8, leading=14, textColor=INK, leftIndent=12, bulletIndent=2, spaceAfter=3),
    "code": ParagraphStyle("code", fontName="Courier", fontSize=8, leading=10.6, textColor=INK, backColor=BGSOFT,
                           borderPadding=6, leftIndent=4, rightIndent=4, spaceBefore=4, spaceAfter=8),
    "caption": ParagraphStyle("caption", fontName="Helvetica-Oblique", fontSize=8.5, leading=11, textColor=MUTED, spaceAfter=10),
    "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=8.4, leading=11, textColor=INK),
    "cellb": ParagraphStyle("cellb", fontName="Helvetica-Bold", fontSize=8.4, leading=11, textColor=INK),
}

def P(text, style="body"): return Paragraph(cn(text), S[style])
def B(text): return Paragraph(cn(text), S["bullet"], bulletText="•")
def CODE(text):
    esc = cn(text).replace("\n", "<br/>").replace("  ", "&nbsp;&nbsp;")
    return Paragraph(esc, S["code"])
def TC(text, bold=False): return Paragraph(cn(text), S["cellb" if bold else "cell"])

def styled_table(data, widths, header=True):
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    style = [
        ("GRID", (0, 0), (-1, -1), 0.4, LINEC),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("ROWBACKGROUNDS", (0, 1 if header else 0), (-1, -1), [colors.white, BGSOFT]),
    ]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), RED)]
    t.setStyle(TableStyle(style))
    return t

def TH(text): return Paragraph(f'<font color="white"><b>{cn(text)}</b></font>', S["cell"])

# ---------- parse real course data from the content files ----------
units = []
for f in ["js/content-hsk1.js", "js/content-hsk2.js"]:
    src = (PROJECT / f).read_text()
    for m in re.finditer(r"id: '(u\d+)', title: '([^']+)',.*?hsk: (\d)", src):
        uid, title, hsk = m.group(1), m.group(2), m.group(3)
        tail = src[m.end():]
        words = len(re.findall(r"'[a-z_0-9]+'", re.search(r"words: \[([^\]]+)\]", tail).group(1)))
        hanzi = re.search(r"hanzi: \[([^\]]+)\]", tail).group(1).replace("'", "").replace(", ", " ")
        gname = re.search(r"name: '((?:[^'\\]|\\.)*)'", tail).group(1).replace("\\'", "'")
        units.append((uid, title, hsk, words, hanzi, gname))
total_words = sum(u[3] for u in units)

# ---------- architecture diagram ----------
def arch_diagram():
    d = Drawing(460, 190)
    def box(x, y, w, h, label, sub, fill):
        d.add(Rect(x, y, w, h, fillColor=fill, strokeColor=LINEC, strokeWidth=1, rx=6, ry=6))
        d.add(String(x + w / 2, y + h - 22, label, fontName="Helvetica-Bold", fontSize=9.5,
                     fillColor=colors.white if fill == RED else INK, textAnchor="middle"))
        for i, line in enumerate(sub):
            d.add(String(x + w / 2, y + h - 36 - i * 11, line, fontName="Helvetica", fontSize=7.5,
                         fillColor=colors.white if fill == RED else MUTED, textAnchor="middle"))
    def arrow(x1, y1, x2, y2, label=""):
        d.add(Line(x1, y1, x2, y2, strokeColor=MUTED, strokeWidth=1.2))
        ang = 6
        d.add(Polygon([x2, y2, x2 - ang, y2 + ang / 1.5, x2 - ang, y2 - ang / 1.5], fillColor=MUTED, strokeColor=None))
        if label:
            d.add(String((x1 + x2) / 2, y1 + 5, label, fontName="Helvetica-Oblique", fontSize=7, fillColor=MUTED, textAnchor="middle"))
    box(0, 110, 150, 75, "Static web app", ["HTML / CSS / vanilla JS", "content + SRS + player", "localStorage state"], RED)
    box(185, 130, 120, 55, "Desktop browser", ["Web Speech API", "(dev & testing)"], BGSOFT)
    box(185, 45, 120, 60, "Kotlin WebView", ["assets/www bundle", "MJBridge: TTS + ASR"], BGSOFT)
    box(340, 45, 120, 60, "GitHub Actions", ["gradle build + sign", "release: latest tag"], BGSOFT)
    box(340, 130, 120, 55, "Android phone", ["mandarin-journey.apk", "sideloaded, offline"], GOLD)
    arrow(150, 157, 185, 157, "open")
    arrow(150, 125, 185, 85, "copied into")
    arrow(305, 75, 340, 75, "git push")
    arrow(400, 105, 400, 130, "")
    return d

# ---------- document ----------
story = []

# Cover
story.append(Spacer(1, 70 * mm))
story.append(Paragraph("Mandarin Journey", S["title"]))
story.append(Spacer(1, 6))
story.append(Paragraph("汉语之旅", S["subtitle"]))
story.append(Spacer(1, 14))
story.append(Paragraph("Build Documentation — architecture, structure & decisions", S["coverinfo"]))
story.append(Spacer(1, 40 * mm))
story.append(Paragraph("Version 0.2 · HSK 1 + 2 · 30 units / 180 lessons<br/>"
                       "github.com/obedkm/chinese101<br/>July 4, 2026 · built with Claude Code", S["coverinfo"]))
story.append(PageBreak())

# 1 Overview
story.append(P("1. What this app is", "h1"))
story.append(P("Mandarin Journey is a beginner Chinese course (HSK 1 and HSK 2) packaged as a "
               "small daily habit. The course is a linear journey of 30 themed units; every unit has the "
               "same six-lesson rhythm — New Words, Hanzi, Grammar, Listening, Speaking, Checkpoint — and each "
               "lesson takes three to five minutes. A spaced-repetition system tracks every word, a streak and a "
               "daily goal reward consistency, and a progress screen answers the two questions that matter: "
               "how many words do I know, and how many lessons did I finish each day?"))
story.append(P("Everything runs offline on the user's device. There is no account, no server, and no analytics; "
               "all progress lives in the browser's localStorage (inside the Android app, the WebView's storage)."))
story.append(P("Key product decisions", "h2"))
story.append(styled_table([
    [TH("Decision"), TH("Choice"), TH("Why")],
    [TC("Scope"), TC(f"HSK 1+2: {total_words} words, 120 hanzi, 30 grammar points"),
     TC("A complete, recognized beginner curriculum with a realistic 5–6 month journey.")],
    [TC("Habit design"), TC("Daily goal + streak + one 'Continue' button"),
     TC("Zero decisions at open time; the app always knows the next 4-minute step.")],
    [TC("UI language"), TC("English"), TC("Teach Chinese from English; interface stays minimal.")],
    [TC("Platform"), TC("Static web app wrapped in an Android APK"),
     TC("The build machine has no Node or Android tooling, so the app avoids all local build steps and CI does the packaging.")],
    [TC("AI"), TC("None in v1 (DeepSeek slot reserved)"),
     TC("Core lessons must work offline and never depend on an API.")],
], [70, 165, 225]))
story.append(Spacer(1, 6))

# 2 Architecture
story.append(P("2. Architecture", "h1"))
story.append(P("One codebase, three run targets. The web app is plain HTML/CSS/JS with no framework and no "
               "bundler — every file is loaded directly by script tags, so a static file server is a full dev "
               "environment. The same files are copied verbatim into the Android wrapper's assets at CI time."))
story.append(arch_diagram())
story.append(P("Figure 1 — the web app is developed and tested in a desktop browser; CI copies it into a thin "
               "Kotlin WebView shell and publishes a signed APK.", "caption"))
story.append(P("The only platform-specific code is speech. js/speech.js feature-detects its backend: in a "
               "browser it uses the Web Speech API (speechSynthesis + webkitSpeechRecognition); inside the APK "
               "it finds window.MJBridge — a JavascriptInterface exposed by the Kotlin wrapper — and routes "
               "text-to-speech and speech-recognition through Android's native engines instead. The rest of the "
               "app is identical on every target."))

# 3 Repo structure
story.append(P("3. Repository structure", "h1"))
story.append(CODE("""chinese101/
  index.html                  app shell: 4 screens + lesson player overlay
  css/style.css               single stylesheet, CSS variables, mobile-first (max 520px)
  js/content-hsk1.js          WORDS + UNITS u1-u15 (HSK 1)
  js/content-hsk2.js          extends WORDS, pushes u16-u30 (HSK 2)
  js/srs.js                   localStorage store + spaced-repetition + streak math
  js/speech.js                TTS/ASR dual backend + pinyin normalizer
  js/app.js                   screens, lesson player, 9 exercise engines
  js/hanzi-data.js            embedded stroke data for all 120 characters
  vendor/hanzi-writer.min.js  HanziWriter 3.7 (stroke animation & tracing quiz)
  data/<char>.json            cached per-character stroke JSONs (build source)
  android/                    Kotlin WebView wrapper (Gradle project)
    keystore.p12              committed signing key -> stable APK signature
    app/src/main/java/.../MainActivity.kt
  .github/workflows/build-apk.yml   CI: build, sign, publish release
  docs/BUILD.pdf              this document"""))
story.append(P("Script load order matters and replaces a module system: hanzi-writer, hanzi-data, content-hsk1, "
               "content-hsk2, speech, srs, app. Each file publishes one global (WORDS, UNITS, HANZI_DATA, Speech, "
               "Pinyin, Store, SRS); app.js is an IIFE that reads them all."))
story.append(PageBreak())

# 4 Web app internals
story.append(P("4. The web app, layer by layer", "h1"))

story.append(P("4.1 Content model", "h2"))
story.append(P("All course data is declarative. A word is one entry in WORDS; a unit bundles word ids, four "
               "characters, one grammar point (with fill-blanks and tile-ordering exercises), and four practice "
               "sentences used by listening and speaking lessons:"))
story.append(CODE("""nihao: { cn: '你好', py: 'nǐ hǎo', pyPlain: 'nihao', en: 'hello', emoji: '..' }

{ id: 'u7', title: 'Food & Drink', hsk: 1,
  words: ['chi', 'he', 'mifan', 'cai', 'cha', 'shui', ...],
  hanzi: ['吃', '喝', '水', '果'],
  grammar: { name: '想 & 要 — wanting things', intro: '...',
             examples: [...], fillBlanks: [...], tiles: [...] },
  sentences: [{ cn: '我想喝茶。', py: 'Wǒ xiǎng hē chá.', en: '...' }, ...] }"""))
story.append(P("pyPlain is the toneless, ü→v form used to check typed answers. Word ids are unique across the "
               "course; homophones get tone-number suffixes (shi 是 / shi2 十, mai 买 / mai4 卖). Content "
               "invariants are validated in the browser: every fill-blank answer appears in its choices, every "
               "unit has 4 sentences with distinct translations, at least 4 distinct meanings for quiz "
               "distractors, no word id reused across units, no character taught twice, and stroke data exists "
               "for all 120 characters."))

story.append(P("4.2 Lesson generation", "h2"))
story.append(P("Lessons are not authored one by one — buildLesson(unit, lessonIndex) composes them from the "
               "unit data at start time, so authoring one unit yields six lessons automatically. Nine exercise "
               "engines cover the five skills:"))
story.append(styled_table([
    [TH("Engine"), TH("Skill"), TH("What the learner does")],
    [TC("Intro card"), TC("vocab"), TC("Sees hanzi + pinyin + meaning + emoji, hears the audio.")],
    [TC("Multiple choice"), TC("vocab"), TC("Picks the meaning of a hanzi word among 4 unit-mates.")],
    [TC("Reverse choice"), TC("vocab"), TC("Picks the hanzi for an English meaning.")],
    [TC("Pinyin typing"), TC("vocab"), TC("Types toneless pinyin; compared via the normalizer.")],
    [TC("Stroke learn"), TC("hanzi"), TC("Watches animated stroke order (HanziWriter).")],
    [TC("Stroke quiz"), TC("hanzi"), TC("Traces the character stroke by stroke; ≤5 mistakes passes.")],
    [TC("Fill the blank"), TC("grammar"), TC("Completes a sentence from 3 choices.")],
    [TC("Tile ordering"), TC("grammar"), TC("Arranges shuffled word tiles into a sentence.")],
    [TC("Audio choice / Speak"), TC("listening / speaking"), TC("Hears a sentence and picks the meaning; or reads one aloud and the recognizer transcript is scored (≥60% character match passes).")],
], [90, 75, 295]))
story.append(Spacer(1, 4))
story.append(P("The Checkpoint lesson samples all of the above and requires 70% accuracy; passing it unlocks "
               "the next unit. Lessons unlock sequentially inside a unit as well, which keeps the journey linear "
               "and decision-free."))

story.append(P("4.3 Spaced repetition", "h2"))
story.append(P("Every graded answer about a word — in any lesson type — feeds a simplified Leitner system "
               "(SRS.record). A word sits in one of six boxes; correct answers promote, wrong answers demote, "
               "and the box sets the next review date:"))
story.append(styled_table([
    [TH("Box"), TH("0"), TH("1"), TH("2"), TH("3"), TH("4"), TH("5")],
    [TC("Next review", True), TC("today"), TC("+1 day"), TC("+3 days"), TC("+7 days"), TC("+14 days"), TC("+30 days")],
    [TC("Stage", True), TC("new"), TC("learning"), TC("learning"), TC("known"), TC("known"), TC("mastered")],
], [70, 65, 65, 65, 65, 65, 65]))
story.append(Spacer(1, 4))
story.append(P("The home screen offers a daily Review session built from words whose due date has arrived "
               "(up to 12, random mix of the four vocab engines). The headline metric 'words I know' counts "
               "stages known + mastered — a word must survive several spaced recalls before it counts, which "
               "keeps the number honest."))

story.append(P("4.4 Habit loop & progress", "h2"))
story.append(P("State is one JSON blob under localStorage key mj_state_v1: settings (daily goal), completed "
               "lessons, a per-day session counter, per-word SRS state, learned characters, and per-skill "
               "lesson counts. The streak is computed, not stored: consecutive days with at least one session, "
               "ending today or yesterday. The progress screen renders words-known with a stage breakdown, a "
               "30-day sessions bar chart with the goal line, streak / best streak, characters learned, units "
               "finished, and a skill-balance chart — all derived from that one blob."))

story.append(P("4.5 Speech and pinyin", "h2"))
story.append(CODE("""Speech.speak(text, rate)   -> MJBridge.speak(...)        (APK)
                           -> speechSynthesis zh-CN voice (browser)
Speech.listen(cb, onEnd)   -> MJBridge.startListening('zh-CN'), result arrives
                              via window._mjOnSpeech(text)    (APK)
                           -> webkitSpeechRecognition zh-CN   (browser)"""))
story.append(P("Typed pinyin is normalized before comparison: lowercase, diacritics folded (nǐ hǎo → nihao, "
               "ǚ → v), everything non-alphabetic dropped — so 'ni hao', 'nihao' and 'ni3hao3' all match. "
               "Speaking answers are scored by Chinese-character overlap between target and transcript, after "
               "mapping Arabic digits back to hanzi (recognizers return '3' for 三)."))

story.append(P("4.6 Hanzi engine and the stroke-data pipeline", "h2"))
story.append(P("Stroke animation and tracing use the open-source HanziWriter library, vendored as one file. "
               "Its per-character stroke definitions normally load from a CDN; to stay offline, a small Python "
               "step scans the content files for every taught character, downloads each missing JSON from "
               "hanzi-writer-data (cached under data/), and rebuilds js/hanzi-data.js — a single embedded "
               "object covering all 120 characters (~250 KB). The app's charDataLoader then never touches the "
               "network."))
story.append(PageBreak())

# 5 Course
story.append(P("5. The course: 30 units", "h1"))
story.append(P(f"{total_words} words across 30 units — {sum(u[3] for u in units if u[2]=='1')} in HSK 1, "
               f"{sum(u[3] for u in units if u[2]=='2')} in HSK 2. Four characters per unit (120 total). "
               "Grammar follows a classic progression; sentences reuse previously taught vocabulary almost "
               "exclusively, so nothing in a lesson feels unearned."))
rows = [[TH("Unit"), TH("Theme"), TH("HSK"), TH("Words"), TH("Hanzi"), TH("Grammar point")]]
for uid, title, hsk, words, hanzi, gname in units:
    rows.append([TC(uid), TC(title), TC(hsk), TC(str(words)), TC(hanzi), TC(gname)])
story.append(styled_table(rows, [30, 92, 30, 42, 68, 198]))
story.append(PageBreak())

# 6 Android wrapper
story.append(P("6. The Android wrapper", "h1"))
story.append(P("android/ is the smallest possible Gradle project: one Activity, no dependencies, no AndroidX. "
               "MainActivity creates a WebView (JavaScript and DOM storage enabled — DOM storage is where all "
               "progress lives), loads file:///android_asset/www/index.html, and exposes a two-method bridge:"))
story.append(styled_table([
    [TH("Bridge call (from JS)"), TH("Native implementation")],
    [TC("MJBridge.speak(text, rate)"), TC("android.speech.tts.TextToSpeech, locale zh-CN, QUEUE_FLUSH — reuses the device's installed Chinese voice.")],
    [TC("MJBridge.startListening('zh-CN')"), TC("android.speech.SpeechRecognizer with a free-form zh-CN intent; first use triggers the RECORD_AUDIO runtime permission. The best transcript (or empty string on error/denial) is delivered back with evaluateJavascript calling window._mjOnSpeech(text).")],
], [155, 305]))
story.append(Spacer(1, 4))
story.append(P("Manifest notes: RECORD_AUDIO and INTERNET permissions, plus a <queries> entry for "
               "android.speech.RecognitionService (required on Android 11+ to discover the recognizer). "
               "minSdk 24 (Android 7), targetSdk 34, portrait-locked. The launcher icon is a hand-written "
               "vector drawable — no mipmap assets needed."))
story.append(P("Signing", "h2"))
story.append(P("android/keystore.p12 is committed to the repo on purpose. It was generated locally with "
               "openssl (the Mac has no Java for keytool) and holds a 30-year self-signed RSA key. For a "
               "sideloaded personal app the key secures nothing — its only job is that every CI build carries "
               "the same signature, so a new APK installs over the old one without uninstalling (which would "
               "wipe localStorage and the learner's streak). The password is plain 'mandarin-journey' and is "
               "documented in the README. LibreSSL writes legacy PKCS12 ciphers, so the workflow has a "
               "normalize step that re-wraps the same key material with modern ciphers if Java refuses to read it."))

# 7 CI/CD
story.append(P("7. CI/CD: push → APK", "h1"))
story.append(P("The build machine constraint (no Node, no Android SDK, no Java) moved all packaging to GitHub "
               "Actions. .github/workflows/build-apk.yml runs on every push to main:"))
story.append(styled_table([
    [TH("#"), TH("Step"), TH("Detail")],
    [TC("1"), TC("Checkout + Temurin JDK 17"), TC("Standard setup actions.")],
    [TC("2"), TC("Normalize keystore"), TC("keytool probe; converts legacy PKCS12 via openssl -legacy only if needed (same key, same signature).")],
    [TC("3"), TC("Copy web app into assets"), TC("index.html, css/, js/, vendor/ → android/app/src/main/assets/www (gitignored; exists only at build time).")],
    [TC("4"), TC("Gradle 8.7 assembleRelease"), TC("AGP 8.4.2, Kotlin 1.9.24; release build signed by the committed keystore.")],
    [TC("5"), TC("Publish"), TC("APK uploaded as a build artifact and attached to the rolling 'latest' release — a stable public download URL.")],
], [20, 130, 310]))
story.append(Spacer(1, 4))
story.append(P("The result: editing a lesson is 'change a JS file, git push, wait three minutes, re-download "
               "mandarin-journey.apk from github.com/obedkm/chinese101/releases/latest'. Updates install over "
               "the previous version with progress intact."))

# 8 Dev workflow & verification
story.append(P("8. Development workflow & verification", "h1"))
story.append(B("Local dev: any static server over the repo root. On the build Mac specifically, the sandboxed "
               "preview server cannot read ~/Documents, so the project is rsynced to a scratchpad directory and "
               "served from there with a tiny Python HTTP server."))
story.append(B("Automated checks, run in the real browser: a validator walks all 30 units enforcing the "
               "content invariants of §4.1 (zero errors at v0.2), and a driver plays lessons end-to-end — "
               "answering multiple-choice, typing pinyin, building tile sentences — to verify the player, "
               "feedback, SRS writes, and the completion/streak flow."))
story.append(B("Manual checks on device: hanzi tracing (needs a finger), speaking (needs a microphone), and "
               "TTS voice availability (Google TTS with the Chinese voice installed)."))

# 9 Decisions & roadmap
story.append(P("9. Design decisions worth remembering", "h1"))
story.append(B("No framework, no build step: the constraint (no Node) became a feature — the app is trivially "
               "hackable, loads instantly, and will still build in ten years."))
story.append(B("Data-driven lessons: adding a unit is pure data entry; six lessons and all exercises fall out "
               "of one declarative object."))
story.append(B("WebView over TWA/PWA: a real sideloadable APK with no hosting requirement, plus native speech "
               "recognition — the one thing a plain WebView cannot do via web APIs — solved with a 150-line bridge."))
story.append(B("Committed keystore: heresy for a store app, correct for a personal sideload — update "
               "continuity beats secrecy of a key that guards nothing."))
story.append(B("Honest metrics: 'words I know' counts only spaced-recall survivors, and reviews count toward "
               "the daily goal, so the streak rewards real practice."))
story.append(P("Roadmap", "h2"))
story.append(B("Phase 4 (in progress): tune lesson length, difficulty and review pacing based on daily use."))
story.append(B("DeepSeek integration (reserved slot): 'explain my mistake', fresh practice-sentence generation "
               "from known words, and a tutor chat — all optional extras layered on the offline core, with the "
               "API key stored locally."))

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 12 * mm, "Mandarin Journey — Build Documentation")
    canvas.drawRightString(A4[0] - 18 * mm, 12 * mm, f"Page {doc.page}")
    canvas.setStrokeColor(LINEC)
    canvas.line(18 * mm, 15 * mm, A4[0] - 18 * mm, 15 * mm)
    canvas.restoreState()

doc = BaseDocTemplate(str(OUT), pagesize=A4,
                      leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=20 * mm,
                      title="Mandarin Journey — Build Documentation", author="Obed Kharistian & Claude Code")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
doc.addPageTemplates([PageTemplate(id="page", frames=[frame], onPage=footer)])
doc.build(story)
print("written:", OUT, OUT.stat().st_size, "bytes")
