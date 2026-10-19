// PEPPACORP Monitor — alarme sonoro (documento offscreen: única forma de uma extensão MV3 tocar áudio).
// Sons sintetizados com Web Audio: sirene, bipe e campainha.
var MAX_MS = 3 * 60 * 1000; // repetição para sozinha depois de 3 minutos
var ctx = null;
var master = null;
var loopTimer = null;
var stopTimer = null;

function tone(type, freq, start, dur, peak) {
  var o = ctx.createOscillator();
  var g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(master);
  o.start(start);
  o.stop(start + dur + 0.05);
  return o;
}

// Cada padrão agenda um ciclo e devolve a duração dele em ms.
var PADROES = {
  sirene: function (t) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(650, t);
    o.frequency.linearRampToValueAtTime(1250, t + 0.6);
    o.frequency.linearRampToValueAtTime(650, t + 1.2);
    o.frequency.linearRampToValueAtTime(1250, t + 1.8);
    o.frequency.linearRampToValueAtTime(650, t + 2.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.05);
    g.gain.setValueAtTime(0.35, t + 2.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 2.45);
    return 2600;
  },
  bipe: function (t) {
    for (var i = 0; i < 3; i++) tone('square', 1000, t + i * 0.25, 0.15, 0.3);
    return 1600;
  },
  campainha: function (t) {
    tone('sine', 880, t, 1.0, 0.6);
    tone('sine', 1760, t, 0.6, 0.15);
    tone('sine', 660, t + 0.45, 1.2, 0.6);
    tone('sine', 1320, t + 0.45, 0.7, 0.15);
    return 2200;
  },
};

function stop(notify) {
  if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
  if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
  if (ctx) { try { ctx.close(); } catch (e) {} ctx = null; }
  if (notify) chrome.runtime.sendMessage({ action: 'peppa_alarm_finished' }).catch(function () {});
}

function play(tipo, volume, repetir) {
  stop(false);
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = Math.max(0.05, Math.min(1, Number(volume) || 0.8));
  master.connect(ctx.destination);
  var padrao = PADROES[tipo] || PADROES.sirene;
  var ciclos = repetir ? Infinity : 2;
  var feitos = 0;
  (function ciclo() {
    if (!ctx) return;
    var dur = padrao(ctx.currentTime + 0.05);
    feitos++;
    if (feitos >= ciclos) { loopTimer = setTimeout(function () { stop(true); }, dur); return; }
    loopTimer = setTimeout(ciclo, dur);
  })();
  if (repetir) stopTimer = setTimeout(function () { stop(true); }, MAX_MS);
}

chrome.runtime.onMessage.addListener(function (msg) {
  if (!msg || msg.target !== 'offscreen') return;
  if (msg.action === 'play') play(msg.tipo, msg.volume, msg.repetir);
  if (msg.action === 'stop') stop(false);
});
