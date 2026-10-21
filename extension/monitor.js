// PEPPACORP Monitor — captura do chat do pregão (Comprasnet).
//
// Fluxo:
//  1. Descobre o código da compra pela URL da aba.
//  2. Pergunta ao PEPPACORP (heartbeat) se a compra está cadastrada no Monitoramento.
//  3. Abre o painel "Mensagens" do portal e percorre a paginação do próprio painel
//     (cliques reais): cada clique faz o portal buscar a página, a sonda (probe.js)
//     entrega a resposta e ela decide se há mais páginas (página cheia = continua).
//     Se o PEPPACORP já tem mensagens da compra, antes olha só a última página (verificação
//     rápida): se nada ali for novo, não há o que importar e o histórico é dado como completo.
//  4. Depois do histórico, volta periodicamente à última página para pegar as novas.
//  5. Cada mensagem nova entra numa fila e só sai quando o servidor confirma.
(function () {
  'use strict';
  if (window.__PEPPA_MONITOR__) return;
  window.__PEPPA_MONITOR__ = true;

  var PAGE_SIZE_DEFAULT = 10;
  var HEARTBEAT_MS = 45000;
  var LIVE_REFRESH_MS = 30000;
  var PAGE_TIMEOUT_MS = 15000;
  var MAX_TRIES = 4;
  var BATCH = 20;

  var compra = detectCompra();
  if (!compra || !isChatPage()) return;

  var registered = false;
  var stopped = false;
  var known = {};          // chave da mensagem na origem -> true (não reenviar)
  var queue = [];          // mensagens aguardando confirmação do servidor
  var sending = false;
  var retryAt = 0;
  var backoff = 0;
  var retryTimer = null;
  var synced = 0;
  var pageSize = PAGE_SIZE_DEFAULT;
  var seenPages = {};      // página (0 = mais antiga) -> quantidade recebida
  var walk = null;         // importação do histórico em andamento
  var historyDone = false;
  var historyRetryAt = 0;
  var lastPanelClick = 0;
  var lastLiveRefresh = 0;
  var badge = null;
  var registeredAt = 0;
  var reportado = {};      // estado da captura já avisado ao PEPPACORP (ciclo do administrador)
  var mensagensServidor = 0; // quantas mensagens desta compra o PEPPACORP já tem
  var respostas = 0;       // respostas do chat recebidas do portal
  var rapido = null;       // verificação rápida em andamento
  var rapidoFeito = false;

  function detectCompra() {
    try {
      var sp = new URLSearchParams(window.location.search);
      var keys = ['compra', 'chaveCompra', 'idCompra', 'chave'];
      for (var i = 0; i < keys.length; i++) {
        var v = sp.get(keys[i]);
        if (v && /^\d{10,}$/.test(v)) return v;
      }
      var m = window.location.pathname.match(/compras\/(\d{10,})/);
      if (m) return m[1];
    } catch (e) {}
    return null;
  }
  function isChatPage() {
    return window.location.hostname === 'cnetmobile.estaleiro.serpro.gov.br' ||
      window.location.pathname.indexOf('acompanhamento-compra') !== -1 ||
      window.location.href.indexOf('comprasnet-web') !== -1;
  }

  // ===== Indicador na tela do portal =====
  function setBadge(text, color) {
    if (!document.body) return;
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'peppa-mon-badge';
      badge.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483646;display:flex;align-items:center;gap:8px;' +
        'max-width:calc(100vw - 24px);padding:6px 12px;border-radius:999px;background:#111;color:#fff;' +
        'font:600 11px "Segoe UI",system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);pointer-events:none;';
      badge.innerHTML = '<span id="peppa-mon-dot" style="width:7px;height:7px;border-radius:50%;flex-shrink:0"></span>' +
        '<span id="peppa-mon-text" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>';
      document.body.appendChild(badge);
    }
    badge.querySelector('#peppa-mon-dot').style.background = color || '#22c55e';
    badge.querySelector('#peppa-mon-text').textContent = 'PEPPACORP · ' + text;
  }
  function liveText() {
    return 'Monitorando — ' + synced + ' mensagem(ns) nova(s)' + (walk ? ' · importando histórico…' : '');
  }

  // ===== Comunicação com o PEPPACORP (via service worker) =====
  function ingest(messages, cb) {
    try {
      chrome.runtime.sendMessage({ action: 'peppa_ingest', codigo_compra: compra, messages: messages }, function (resp) {
        if (chrome.runtime.lastError) { cb({ ok: false, error: chrome.runtime.lastError.message }); return; }
        cb(resp || { ok: false, error: 'sem resposta' });
      });
    } catch (e) {
      // Extensão recarregada/atualizada: este script ficou órfão. Recarregar a aba resolve.
      cb({ ok: false, error: 'extensão atualizada — recarregue a página' });
    }
  }

  // Avisa o PEPPACORP (página do ciclo do administrador) do andamento desta compra, uma vez por estado.
  function reportar(estado) {
    if (reportado[estado]) return;
    reportado[estado] = true;
    try { chrome.runtime.sendMessage({ action: 'peppa_capture_state', codigo_compra: compra, estado: estado, synced: synced }); } catch (e) {}
  }

  function handleState(d) {
    if (d.encerrado) { stop('Monitoramento encerrado no PEPPACORP', '#94a3b8'); return false; }
    if (d.not_monitored) {
      registered = false;
      reportar('nao_monitorada');
      setBadge('Compra ' + compra + ' não cadastrada no Monitoramento', '#f59e0b');
      return false;
    }
    return true;
  }

  function heartbeat() {
    if (stopped) return;
    ingest([], function (resp) {
      if (!resp.ok) { setBadge(resp.error || 'Sem conexão com o PEPPACORP', '#ef4444'); return; }
      if (resp.data && typeof resp.data.mensagens === 'number') mensagensServidor = resp.data.mensagens;
      if (!handleState(resp.data || {})) return;
      if (!registered) {
        registered = true;
        registeredAt = Date.now();
        setBadge(liveText(), null);
        // Reenvia as respostas do chat que passaram antes do cadastro ser confirmado.
        window.postMessage({ type: 'PEPPA_HELLO' }, window.location.origin);
        tick();
      }
    });
  }

  function stop(text, color) {
    reportar('encerrado');
    stopped = true;
    registered = false;
    walk = null;
    queue = [];
    setBadge(text, color);
  }

  // ===== Fila com confirmação =====
  function enqueue(list) {
    for (var i = 0; i < list.length; i++) queue.push(list[i]);
    pump();
  }
  function pump() {
    if (sending || !queue.length || stopped) return;
    var wait = retryAt - Date.now();
    if (wait > 0) {
      if (!retryTimer) retryTimer = setTimeout(function () { retryTimer = null; pump(); }, wait);
      return;
    }
    var batch = queue.slice(0, BATCH);
    sending = true;
    ingest(batch, function (resp) {
      sending = false;
      if (!resp.ok) {
        // O lote continua na fila; o servidor deduplica, então reenviar é seguro.
        backoff = backoff ? Math.min(backoff * 2, 60000) : 5000;
        retryAt = Date.now() + backoff;
        setBadge('Falha ao enviar (' + (resp.error || 'erro') + ') — nova tentativa em ' + Math.round(backoff / 1000) + 's', '#ef4444');
        pump();
        return;
      }
      var d = resp.data || {};
      if (d.not_monitored) {
        retryAt = Date.now() + 30000;
        handleState(d);
        pump();
        return;
      }
      if (!handleState(d)) return;
      queue.splice(0, batch.length);
      backoff = 0;
      retryAt = 0;
      synced += Number(d.synced) || 0;
      if (d.mentions && d.mentions.length) {
        setBadge('⚠ MENÇÃO: ' + (d.mentions[0].termo_encontrado || '') + ' — veja os alertas no PEPPACORP', '#ef4444');
      } else {
        setBadge(liveText(), null);
      }
      pump();
    });
  }

  // ===== Respostas do chat (vindas da sonda) =====
  function pageOf(u) { var m = String(u).match(/[?&]page=(\d+)/); return m ? parseInt(m[1], 10) : 0; }
  function sizeOf(u) { var m = String(u).match(/[?&]size=(\d+)/); return m ? parseInt(m[1], 10) : PAGE_SIZE_DEFAULT; }
  function rowsOf(body) {
    try {
      var j = JSON.parse(body);
      if (Array.isArray(j)) return j;
      if (j && Array.isArray(j.content)) return j.content;
      if (j && Array.isArray(j.mensagens)) return j.mensagens;
    } catch (e) {}
    return null;
  }
  function keyOf(m) {
    var k = m.chaveMensagemNaOrigem != null ? m.chaveMensagemNaOrigem : (m.id != null ? m.id : m.codigo);
    return k == null ? null : String(k);
  }

  window.addEventListener('message', function (ev) {
    if (ev.source !== window || !ev.data || ev.data.type !== 'PEPPA_CHAT') return;
    var d = ev.data;
    var m = String(d.u || '').match(/comprasnet-mensagem\/v2\/chat\/(\d+)/);
    if (!m || m[1] !== compra || !registered || stopped) return;
    if (!(d.s >= 200 && d.s < 300)) return; // erro (429, 401…) nunca encerra: o relógio da caminhada tenta de novo
    var rows = rowsOf(d.b);
    if (!rows) return;
    var page = pageOf(d.u);
    pageSize = sizeOf(d.u) || pageSize;
    if (seenPages[page] === undefined || rows.length > seenPages[page]) seenPages[page] = rows.length;
    respostas++;
    var fresh = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || typeof r !== 'object') continue;
      var k = keyOf(r);
      if (!k || known[k]) continue;
      known[k] = true;
      fresh.push(r);
    }
    if (fresh.length) enqueue(fresh);
    tick();
  });

  // ===== Painel "Mensagens" do portal =====
  function visible(el) { return !!(el && el.getClientRects().length) && !el.closest('#peppa-mon-badge'); }
  function panelOpen() {
    var els = document.querySelectorAll('h1,h2,h3,h4,h5,h6,header,div,span,p,strong');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.children.length > 2 || !visible(el)) continue;
      if ((el.textContent || '').trim() === 'Mensagens') return true;
    }
    return false;
  }
  function findPanelTrigger() {
    var labeled = document.querySelectorAll('button[aria-label],a[aria-label],[role="button"][aria-label],button[title],a[title],[mattooltip],[ng-reflect-message]');
    for (var i = 0; i < labeled.length; i++) {
      var el = labeled[i];
      var label = ['aria-label', 'title', 'mattooltip', 'ng-reflect-message'].map(function (a) { return el.getAttribute(a) || ''; }).join(' ');
      if (visible(el) && /mensag|chat/i.test(label)) return el.closest('button,a,[role="button"]') || el;
    }
    var icons = document.querySelectorAll('button i,button span,button svg,button mat-icon,[role="button"] i,[role="button"] svg,a i,a svg');
    for (var j = 0; j < icons.length; j++) {
      var ic = icons[j];
      var use = ic.querySelector('use');
      var name = (ic.getAttribute('class') || '') + ' ' + (ic.getAttribute('data-icon') || '') + ' ' + (use ? (use.getAttribute('href') || use.getAttribute('xlink:href') || '') : '');
      var txt = (ic.textContent || '').trim();
      if (!/envelope|fa-comments|fa-message|mail_outline|markunread/i.test(name) && !/^(mail|email|chat|mensagens|mail_outline|markunread)$/i.test(txt)) continue;
      var btn = ic.closest('button,a,[role="button"]');
      if (btn && visible(btn) && !btn.disabled && !/^mailto:/i.test(btn.getAttribute('href') || '')) return btn;
    }
    return null;
  }
  function ensurePanel() {
    // Respostas do chat já chegando também provam que o painel está aberto
    // (cobre o caso de o título do painel ter outro texto no portal).
    if (panelOpen() || Object.keys(seenPages).length) return true;
    if (Date.now() - lastPanelClick < 5000) return false;
    var t = findPanelTrigger();
    if (t) { lastPanelClick = Date.now(); t.click(); }
    else if (registeredAt && Date.now() - registeredAt > 20000) {
      setBadge('Clique em “Mensagens” no portal para começar a captura', '#f59e0b');
    }
    return false;
  }

  // ===== Verificação humana (hCaptcha) do portal =====
  // O monitor não resolve captcha: avisa e traz a janela para frente para você resolver.
  var lastCaptchaAlert = 0;
  var captchaShown = false;
  function captchaVisible() {
    var frames = document.querySelectorAll('iframe[src*="hcaptcha"],iframe[src*="recaptcha"],iframe[title*="captcha" i]');
    for (var i = 0; i < frames.length; i++) {
      var r = frames[i].getBoundingClientRect();
      if (r.width > 150 && r.height > 150 && frames[i].offsetParent !== null) return true; // desafio aberto, não o selo pequeno
    }
    return false;
  }
  function checkCaptcha() {
    var visibleNow = captchaVisible();
    if (visibleNow) {
      setBadge('Resolva a verificação (captcha) do portal para a captura continuar', '#f59e0b');
      reportar('captcha');
      if (Date.now() - lastCaptchaAlert > 60000) {
        lastCaptchaAlert = Date.now();
        try { chrome.runtime.sendMessage({ action: 'peppa_captcha', codigo_compra: compra }); } catch (e) {}
      }
    } else if (captchaShown) {
      setBadge(registered ? liveText() : 'Conectando à compra ' + compra + '…', registered ? null : '#f59e0b');
    }
    captchaShown = visibleNow;
    return visibleNow;
  }

  // ===== Paginação do painel (<< < 1 2 3 > >>) =====
  var ARROWS = {
    first: ['<<', '«', 'first_page', 'keyboard_double_arrow_left'],
    prev: ['<', '‹', 'chevron_left', 'navigate_before', 'keyboard_arrow_left'],
    next: ['>', '›', 'chevron_right', 'navigate_next', 'keyboard_arrow_right'],
    last: ['>>', '»', 'last_page', 'keyboard_double_arrow_right']
  };
  function kindOf(t) {
    for (var k in ARROWS) if (ARROWS[k].indexOf(t) !== -1) return k;
    return /^\d{1,4}$/.test(t) ? 'num' : null;
  }
  // O paginador é o menor bloco que contém seta para trás, seta para frente e números.
  function pager() {
    var leaves = [];
    var all = document.querySelectorAll('button,a,li,span,i,mat-icon,div');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.children.length || !visible(el)) continue;
      var kind = kindOf((el.textContent || '').trim());
      if (kind) leaves.push({ el: el, kind: kind, t: (el.textContent || '').trim() });
    }
    var best = null, bestLen = Infinity;
    for (var a = 0; a < leaves.length; a++) {
      var node = leaves[a].el.parentElement;
      for (var depth = 0; depth < 8 && node && node !== document.body; depth++, node = node.parentElement) {
        var back = false, fwd = false, nums = 0;
        for (var b = 0; b < leaves.length; b++) {
          if (!node.contains(leaves[b].el)) continue;
          var kd = leaves[b].kind;
          if (kd === 'first' || kd === 'prev') back = true;
          else if (kd === 'next' || kd === 'last') fwd = true;
          else nums++;
        }
        if (back && fwd && nums) {
          var len = (node.textContent || '').length;
          if (len < bestLen) { bestLen = len; best = node; }
          break;
        }
      }
    }
    if (!best) return null;
    return leaves.filter(function (l) { return best.contains(l.el); });
  }
  function clickable(el) {
    for (var n = el, i = 0; n && i < 4; n = n.parentElement, i++) {
      if (n.tagName === 'BUTTON' || n.tagName === 'A' || (n.getAttribute && n.getAttribute('role') === 'button')) return n;
    }
    return el;
  }
  function disabled(el) {
    for (var n = el, i = 0; n && i < 4; n = n.parentElement, i++) {
      if (n.disabled || (n.getAttribute && n.getAttribute('aria-disabled') === 'true')) return true;
      if (n.classList && (n.classList.contains('disabled') || n.classList.contains('p-disabled'))) return true;
    }
    return false;
  }
  function clickPager(kind, visualNumber) {
    var leaves = pager();
    if (!leaves) return false;
    for (var i = 0; i < leaves.length; i++) {
      var l = leaves[i];
      var match = kind === 'num' ? (l.kind === 'num' && Number(l.t) === visualNumber) : l.kind === kind;
      if (!match) continue;
      var btn = clickable(l.el);
      if (disabled(btn)) return false;
      btn.click();
      return true;
    }
    return false;
  }

  // ===== Importação do histórico =====
  function topSeen() {
    var top = -1;
    for (var p in seenPages) top = Math.max(top, Number(p));
    return top;
  }
  // ===== Verificação rápida =====
  // Abre a última página (onde ficam as mais novas) e espera o PEPPACORP confirmar o envio:
  // nenhuma nova = compra já está em dia. Qualquer novidade ou falha cai na importação completa.
  function startRapido() {
    rapido = { since: Date.now(), clicked: false, moved: false, base: 0 };
    setBadge('Verificando mensagens novas…', '#f59e0b');
  }
  function desistirRapido() {
    rapido = null;
    rapidoFeito = true;
    startHistory();
  }
  function rapidoStep() {
    var q = rapido;
    if (!q.clicked) {
      // Espera a primeira resposta do painel (prova de que ele carregou).
      if (!respostas) { if (Date.now() - q.since > PAGE_TIMEOUT_MS) desistirRapido(); return; }
      q.clicked = true;
      q.base = respostas;
      q.since = Date.now();
      q.moved = clickPager('last'); // sem ">>" clicável: já está na última página
      return;
    }
    if (q.moved && respostas === q.base) { if (Date.now() - q.since > PAGE_TIMEOUT_MS) desistirRapido(); return; }
    if (queue.length || sending) return; // espera o PEPPACORP confirmar o que foi lido
    if (synced > 0) { desistirRapido(); return; }
    rapido = null;
    rapidoFeito = true;
    finishHistory(true);
    setBadge('Sem mensagens novas — ' + liveText(), null);
  }

  function startHistory() {
    walk = { await: 0, clickAt: Date.now(), clicked: false, since: 0, tries: 0 };
    setBadge('Importando histórico do chat…', '#f59e0b');
  }
  function finishHistory(complete, reason) {
    walk = null;
    if (complete) {
      historyDone = true;
      setBadge(liveText(), null);
    } else {
      historyRetryAt = Date.now() + 60000;
      reportar('incompleto');
      setBadge('Histórico incompleto (' + reason + ') — nova tentativa em 1 min; ao vivo continua', '#ef4444');
    }
  }
  function goTo(page) {
    // page é zero-based; o painel mostra page + 1
    if (page === 0 && clickPager('first')) return true;
    if (clickPager('num', page + 1)) return true;
    return clickPager('next');
  }
  function walkStep() {
    var w = walk;
    if (seenPages[w.await] !== undefined) {
      var received = seenPages[w.await];
      // Página cheia sempre continua; parcial só encerra se for a maior página já vista.
      if (received < pageSize && w.await >= topSeen()) { finishHistory(true); return; }
      var pace = 3500 + Math.floor(Math.random() * 1500); // espaça os pedidos para não cair no limite do portal
      walk = { await: w.await + 1, clickAt: Date.now() + pace, clicked: false, since: 0, tries: 0 };
      return;
    }
    if (!w.clicked) {
      if (Date.now() < w.clickAt) return;
      w.clicked = true;
      w.since = Date.now();
      // Página 0: se já estamos nela (sem "<<" clicável), a resposta da abertura do painel decide.
      if (w.await === 0) goTo(0); else if (!clickPager('next')) goTo(w.await);
      return;
    }
    if (Date.now() - w.since > PAGE_TIMEOUT_MS) {
      w.tries++;
      if (w.tries > MAX_TRIES) { finishHistory(false, 'sem resposta da página ' + (w.await + 1)); return; }
      w.since = Date.now();
      if (w.tries === 2 && w.await > 0 && clickPager('prev')) {
        // sai e volta: força o portal a refazer o pedido da página
        setTimeout(function () { if (walk === w) goTo(w.await); }, 1500);
      } else {
        goTo(w.await);
      }
    }
  }

  // ===== Relógio principal =====
  function tick() {
    if (stopped || checkCaptcha()) return;
    if (!registered) return;
    reportar('registrado');
    if (!ensurePanel()) return;
    if (walk) { walkStep(); return; }
    if (rapido) { rapidoStep(); return; }
    if (!historyDone) {
      if (Date.now() < historyRetryAt) return;
      if (!rapidoFeito && mensagensServidor > 0) startRapido();
      else startHistory();
      return;
    }
    // Histórico importado e tudo confirmado pelo servidor: compra atualizada.
    if (!queue.length && !sending) reportar('concluido');
    // Ao vivo: as mensagens novas ficam na última página.
    if (Date.now() - lastLiveRefresh > LIVE_REFRESH_MS) {
      lastLiveRefresh = Date.now();
      liveRefresh();
    }
  }

  // Faz o portal buscar de novo a última página (onde chegam as novas).
  function liveRefresh() {
    if (clickPager('last')) return;               // surgiu página nova
    if (clickPager('prev')) {                     // já na última: sai e volta
      setTimeout(function () { clickPager('last'); }, 1500);
      return;
    }
    var t = findPanelTrigger();                   // página única: fecha e reabre o painel
    if (t) { t.click(); lastPanelClick = 0; }
  }

  function boot(cfg) {
    if (!cfg.peppa_server || !cfg.peppa_key) {
      setBadge('Conecte a extensão em PEPPACORP → Conectar Robô', '#f59e0b');
      return;
    }
    stopped = false;
    setBadge('Conectando à compra ' + compra + '…', '#f59e0b');
    heartbeat();
  }

  chrome.runtime.onMessage.addListener(function (req, sender, sendResponse) {
    if (req.action !== 'peppa_capture_reset' || req.codigo_compra !== compra) return false;
    reportado = {};
    if (stopped) reportar('encerrado');
    sendResponse({ ok: true });
    return false;
  });

  function start() {
    if (!document.body) { setTimeout(start, 300); return; }
    chrome.storage.local.get(['peppa_server', 'peppa_key'], boot);
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || (!changes.peppa_server && !changes.peppa_key)) return;
      registered = false;
      chrome.storage.local.get(['peppa_server', 'peppa_key'], boot);
    });
    setInterval(heartbeat, HEARTBEAT_MS);
    setInterval(tick, 1000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') heartbeat(); });
  }
  start();
})();
