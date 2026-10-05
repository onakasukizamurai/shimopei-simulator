/* しもぺいシミュレーター — ゲームロジック */
(() => {
"use strict";

const NAME = "しもへい。";
const AVATAR = "assets/shimohei.png";
const MEMBERS = 9;                // グループの人数（自分を含む）
const START_MIN = 23 * 60 + 47;   // 土曜 23:47
const WAKE_MIN = 5 * 60 + 30;     // 朝練6時集合 − 準備30分
const NAG_DELAY = 26000;

const $ = (id) => document.getElementById(id);
const chat = $("chat"), quick = $("quick"), input = $("input");
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/* 自由入力の既定効果 */
const BASE = {
  honest:  { m: -4, tr:  2 },
  excuse:  { m: -6, tr: -6 },
  dodge:   { m: -6, tr: -6 },
  flatter: { m: -4, tr:  3 },
  logic:   { m: -3, tr:  7 },
  rebel:   { m: -6, tr:-10 },
  genius:  { m: -3, tr: 11 },
  silent:  { m: -7, tr: -7 }
};

let S;
function reset() {
  S = {
    mental: 100, trust: 50, clock: START_MIN,
    phase: 0, topic: pick(DATA.topics), used: [], turns: 0, botMsgs: 0,
    types: {}, nagLevel: 0, nagTimer: null,
    lastSide: null, busy: false, over: false
  };
}

/* ---------- 時計 ---------- */
const pad = (n) => String(n).padStart(2, "0");
const fmtClock = (m) => `${pad(Math.floor((m % 1440) / 60))}:${pad(m % 60)}`;
function sleepLeft() { return Math.max(0, (WAKE_MIN + 1440) - S.clock); }
function tick(min) { S.clock += min; paintHud(); }

/* ---------- HUD ---------- */
function paintHud() {
  S.mental = Math.max(0, Math.min(100, S.mental));
  S.trust  = Math.max(0, Math.min(100, S.trust));
  $("barMental").style.width = S.mental + "%";
  $("barTrust").style.width  = S.trust + "%";
  $("valMental").textContent = Math.round(S.mental);
  $("valTrust").textContent  = Math.round(S.trust);
  const sl = sleepLeft();
  $("valSleep").textContent = `${Math.floor(sl / 60)}:${pad(sl % 60)}`;
  $("sbTime").textContent = fmtClock(S.clock);
  $("hud").classList.toggle("danger", S.mental <= 25 || S.trust <= 15);
}

/* ---------- 描画 ---------- */
function scroll() { chat.scrollTop = chat.scrollHeight; }

function sysEl(text) {
  const d = document.createElement("div");
  d.className = "sys";
  d.textContent = text;
  return d;
}

function addSys(text) {
  chat.appendChild(sysEl(text));
  S.lastSide = null;
  scroll();
}

function addDayPill(text) {
  const d = document.createElement("div");
  d.className = "daypill";
  d.textContent = text;
  chat.appendChild(d);
  scroll();
}

/* side: "in" | "out", body: {text} | {sticker} | {photo} */
function addRow(side, body) {
  const grouped = S.lastSide === side;
  const row = document.createElement("div");
  row.className = "row " + side + (grouped ? " grouped" : "");

  if (side === "in") {
    const av = document.createElement("img");
    av.className = "av" + (grouped ? " spacer" : "");
    av.src = AVATAR;
    av.alt = NAME;
    row.appendChild(av);
  }

  const stack = document.createElement("div");
  stack.className = "stack";
  if (side === "in" && !grouped) {
    const nm = document.createElement("div");
    nm.className = "sender";
    nm.textContent = NAME;
    stack.appendChild(nm);
  }

  if (body.sticker) {
    const st = document.createElement("div");
    st.className = "sticker";
    st.textContent = body.sticker;
    stack.appendChild(st);
  } else if (body.photo) {
    const ph = document.createElement("div");
    ph.className = "photo";
    ph.innerHTML = `<div class="ph-body"></div><div class="ph-cap"></div>`;
    ph.querySelector(".ph-body").textContent = body.photo.i;
    ph.querySelector(".ph-cap").textContent = body.photo.c;
    stack.appendChild(ph);
  } else if (body.link) {
    const b = document.createElement("div");
    b.className = "bub";
    b.innerHTML = `<a class="url"></a><div class="card">` +
                  `<div class="card-t"></div><div class="card-d"></div>` +
                  `<div class="card-u"></div></div>`;
    b.querySelector(".url").textContent = body.link.url;
    b.querySelector(".card-t").textContent = body.link.t;
    b.querySelector(".card-d").textContent = body.link.d;
    b.querySelector(".card-u").textContent = body.link.url.replace(/^https?:\/\//, "").split("/")[0];
    stack.appendChild(b);
  } else {
    const b = document.createElement("div");
    b.className = "bub" + (grouped ? " cont" : "");
    if (body.quote) {
      const q = document.createElement("div");
      q.className = "quote";
      q.innerHTML = `<i class="quote-av"></i><div class="quote-body">` +
                    `<span class="quote-name"></span><span class="quote-text"></span></div>`;
      q.querySelector(".quote-name").textContent = body.quote.name;
      q.querySelector(".quote-text").textContent =
        body.quote.text.length > 24 ? body.quote.text.slice(0, 24) + "…" : body.quote.text;
      b.appendChild(q);
    }
    b.appendChild(document.createTextNode(body.text));
    stack.appendChild(b);
  }
  row.appendChild(stack);

  const meta = document.createElement("div");
  meta.className = "meta";
  if (side === "out") meta.innerHTML = `<span class="read" hidden></span>`;
  const t = document.createElement("span");
  t.textContent = fmtClock(S.clock);
  meta.appendChild(t);
  row.appendChild(meta);

  chat.appendChild(row);
  S.lastSide = side;
  scroll();
  return row;
}

/* グループなので既読は人数表示。夜が進むほど見ている人が増える */
function markRead() {
  const seen = Math.min(MEMBERS - 1, 1 + Math.floor(S.turns * 0.9));
  chat.querySelectorAll(".row.out .read[hidden]").forEach((e) => {
    e.textContent = "既読 " + seen;
    e.hidden = false;
  });
}

function fillTopic(text) {
  const t = DATA.topicMeta[S.topic] || DATA.topicMeta.tactics;
  return String(text)
    .replaceAll("{THING}", t.thing)
    .replaceAll("{EVENT}", t.event)
    .replaceAll("{FILE}", t.file);
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* LINEに入力中表示は無いので、読む間だけ空ける */
function readPause(len) { return wait(Math.min(3000, 1000 + len * 65)); }

/* しもへい。の連投 */
/* quote を渡すと、1通目だけ相手の発言を引用して返す（本人がよくやる） */
async function botSay(msgs, quote) {
  markRead();
  for (const m of msgs) {
    const instant = S.botMsgs === 0;   // ゲーム最初の1通は待たせずに出す
    if (typeof m === "string") {
      if (!instant) await readPause(m.length);
      tick(1);
      addRow("in", { text: fillTopic(m), quote });
      quote = null;
      S.botMsgs++;
    } else if (m.s) {
      await wait(1200);
      tick(1);
      addRow("in", { sticker: m.s });
      S.botMsgs++;
    } else if (m.photo) {
      await wait(1600);
      tick(1);
      addRow("in", { photo: m.photo });
      S.botMsgs++;
    } else if (m.link) {
      await wait(1600);
      tick(1);
      addRow("in", { link: m.link });
      S.botMsgs++;
    } else if (m.unsend) {
      /* 言いすぎたやつを自分で消す。本人が本当によくやる */
      await readPause(m.unsend.length);
      tick(1);
      const row = addRow("in", { text: fillTopic(m.unsend) });
      S.botMsgs++;
      await wait(2600);
      row.replaceWith(sysEl(NAME + "がメッセージの送信を取り消しました"));
      scroll();
    } else if (m.sys) {
      await wait(900);
      addSys(fillTopic(m.sys));
    }
    await wait(450);
  }
}

function meSay(text) {
  tick(1);
  addRow("out", { text });
}

function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(t._tid);
  t._tid = setTimeout(() => (t.hidden = true), 2000);
}

/* ---------- 返信候補 ---------- */
function showChoices(choices) {
  quick.innerHTML = `<div class="quick-hint">返信候補をタップ、または自由に入力</div>`;
  choices.forEach((c) => {
    const b = document.createElement("button");
    b.className = "qbtn";
    b.textContent = c.t;
    b.onclick = () => answer(c);
    quick.appendChild(b);
  });
  quick.hidden = false;
  setInputEnabled(true);
  startNag();
}

function hideChoices() {
  quick.hidden = true;
  quick.innerHTML = "";
  setInputEnabled(false);
}

function setInputEnabled(on) {
  input.disabled = !on;
  $("btnSend").disabled = !on;
}

/* ---------- 催促 ---------- */
function startNag() {
  stopNag();
  S.nagTimer = setTimeout(doNag, NAG_DELAY);
}
function stopNag() {
  if (S.nagTimer) clearTimeout(S.nagTimer);
  S.nagTimer = null;
}
async function doNag() {
  if (S.over || S.busy) return;
  const nag = DATA.nags[Math.min(S.nagLevel, DATA.nags.length - 1)];
  S.nagLevel++;
  S.busy = true;
  $("phone").classList.add("shake");
  setTimeout(() => $("phone").classList.remove("shake"), 420);
  S.mental += nag.mental;
  paintHud();
  await botSay(nag.msgs);
  S.busy = false;
  if (checkOver()) return;
  if (nag.forceCall) { incomingCall(); return; }
  S.nagTimer = setTimeout(doNag, Math.max(15000, NAG_DELAY - S.nagLevel * 2000));
}

/* ---------- 自由入力の判定 ---------- */
function classify(text) {
  const t = text.trim();
  if (!/[\p{L}\p{N}]/u.test(t)) return "silent";
  for (const k of DATA.keywords) if (k.words.some((w) => t.includes(w))) return k.type;
  if (t.length <= 4) return "silent";
  return t.length >= 35 ? "logic" : "honest";
}

function submitFree() {
  const text = input.value.trim();
  if (!text || input.disabled || S.busy) return;
  input.value = "";
  if (/退部|辞めます|やめます|もう辞める|ブロックします/.test(text)) {
    stopNag(); hideChoices(); meSay(text);
    return finish("quit");
  }
  if (/^(寝ます|おやすみ|もう寝る|寝る)/.test(text)) {
    stopNag(); hideChoices(); meSay(text);
    return finish("sleep");
  }
  const type = classify(text);
  answer({ t: text, type, m: BASE[type].m, tr: BASE[type].tr, free: true });
}

/* ---------- 1ターン ---------- */
async function answer(choice) {
  if (S.busy) return;
  S.busy = true;
  stopNag();
  hideChoices();

  meSay(choice.t);
  S.turns++;
  S.types[choice.type] = (S.types[choice.type] || 0) + 1;
  S.mental += choice.m;
  S.trust  += choice.tr;
  S.nagLevel = Math.max(0, S.nagLevel - 1);
  tick(2);
  paintHud();

  await wait(900);
  await botSay(choice.reply || pick(DATA.typeReply[choice.type]),
               { name: "あなた", text: choice.t });
  S.busy = false;

  if (checkOver()) return;
  if (choice.forceCall) { incomingCall(); return; }

  S.phase++;
  if (S.phase >= DATA.phases.length) return finish(S.trust >= 85 ? "legend" : "survive");
  nextPhase();
}

async function nextPhase() {
  S.busy = true;
  const phase = DATA.phases[S.phase];
  const pool = phase.cards.filter((c) => !c.topic || c.topic === S.topic);
  const card = pick(pool.length ? pool : phase.cards);
  if (S.botMsgs > 0) await wait(1200);
  await botSay(card.msgs);
  S.busy = false;
  if (checkOver()) return;
  showChoices(card.choices);
}

function checkOver() {
  if (S.over) return true;
  if (S.mental <= 0) { finish("sleep"); return true; }
  if (S.trust <= 0) { finish("cut"); return true; }
  if (sleepLeft() <= 0) { finish("timeup"); return true; }
  return false;
}

/* ---------- 着信 ---------- */
function incomingCall() {
  stopNag();
  hideChoices();
  const ov = $("call");
  ov.hidden = false;
  $("callState").textContent = "着信中…";
  let left = 9;
  const iv = setInterval(() => {
    left--;
    $("callState").textContent = left > 0 ? `着信中…（あと${left}秒）` : "着信中…";
    if (left <= 0) { clearInterval(iv); close(false); }
  }, 1000);

  function close(accepted) {
    clearInterval(iv);
    ov.hidden = true;
    $("callAccept").onclick = null;
    $("callDecline").onclick = null;
    if (accepted) return finish("call");
    (async () => {
      S.busy = true;
      S.mental -= 10;
      S.trust  -= 6;
      paintHud();
      addSys("不在着信：しもへい。");
      await botSay(pick([
        ["出ないんだ", "まあいいよ。文字で続けよう"],
        ["ワンコールで切ったね?", "見てたよ、ちゃんと"],
        ["電話、苦手なんだな。", "最近の子はそうだよね。\nわかったわかった"]
      ]));
      S.busy = false;
      if (checkOver()) return;
      S.phase++;
      if (S.phase >= DATA.phases.length) return finish(S.trust >= 85 ? "legend" : "survive");
      nextPhase();
    })();
  }

  $("callAccept").onclick = () => close(true);
  $("callDecline").onclick = () => close(false);
}

/* ---------- 結果 ---------- */
function grade() {
  const score = S.mental * 0.5 + S.trust * 0.5;
  return score >= 80 ? "S" : score >= 65 ? "A" : score >= 50 ? "B" : score >= 35 ? "C" : "D";
}

function dominantType() {
  let best = "honest", n = -1;
  for (const k in S.types) if (S.types[k] > n) { n = S.types[k]; best = k; }
  return best;
}

async function finish(key) {
  if (S.over) return;
  S.over = true;
  stopNag();
  hideChoices();
  S.busy = true;

  const e = DATA.endings[key];
  if (e.msgs) { await wait(500); await botSay(e.msgs); }
  await wait(900);

  const elapsed = S.clock - START_MIN;
  const style = DATA.styles[dominantType()];
  const rank = (key === "survive" || key === "legend") ? grade() : e.rank;

  $("resRank").textContent = rank;
  $("resTitle").textContent = e.title;
  $("resSub").textContent = e.sub;
  $("resMental").textContent = Math.round(S.mental);
  $("resTrust").textContent = Math.round(S.trust);
  $("resTime").textContent = `${Math.floor(elapsed / 60)}時間${pad(elapsed % 60)}分`;
  $("resMsgs").textContent = `${S.botMsgs}通`;
  $("resType").textContent = style;
  $("end").hidden = false;

  const url = location.href.split("#")[0];
  const text = `しもぺいシミュレーター：判定【${rank}】「${e.title}」\nメンタル${Math.round(S.mental)} / 信頼${Math.round(S.trust)}／${style}\nお前もやってみろ`;
  $("btnShareX").onclick = () =>
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank");
  $("btnShareLine").onclick = () =>
    window.open(`https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, "_blank");
  $("btnCopy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      $("copyMsg").textContent = "リンクをコピーしました。部活のグループLINEに貼ってください。";
    } catch {
      $("copyMsg").textContent = url;
    }
  };
}

/* ---------- 起動 ---------- */
function begin() {
  reset();
  chat.innerHTML = "";
  $("end").hidden = true;
  $("call").hidden = true;
  $("copyMsg").textContent = "";
  paintHud();
  addDayPill("今日");
  setInputEnabled(false);
  nextPhase();
}

$("btnStart").onclick = () => { $("start").hidden = true; begin(); };
$("btnRetry").onclick = () => { $("end").hidden = true; begin(); };
$("btnSend").onclick = submitFree;
input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") submitFree(); });
$("btnBack").onclick = () => toast("逃げられません");
setInputEnabled(false);
reset();
paintHud();

})();
