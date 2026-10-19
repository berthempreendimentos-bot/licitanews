// PEPPACORP Monitor — sonda do chat (roda no contexto da página do portal).
// Só observa as respostas que o PRÓPRIO portal recebe do endpoint do chat
// (/comprasnet-mensagem/v2/chat/{compra}). Não lê tokens, cookies nem outras
// rotas, não faz requisições e não altera nada do que o portal recebe.
(function () {
  'use strict';
  if (window.__PEPPA_PROBE__) return;
  window.__PEPPA_PROBE__ = true;

  var CHAT = 'comprasnet-mensagem/v2/chat/';
  var buffer = [];

  function isChat(u) { return String(u || '').indexOf(CHAT) !== -1; }
  // O parâmetro captcha é temporário e não interessa ao monitor: sai antes de repassar.
  function clean(u) { return String(u || '').replace(/([?&])captcha=[^&]*&?/i, '$1').replace(/[?&]$/, ''); }

  function emit(url, status, body) {
    var msg = { type: 'PEPPA_CHAT', u: clean(url), s: status, b: String(body || '').substring(0, 200000) };
    if (buffer.length < 30) buffer.push(msg);
    try { window.postMessage(msg, window.location.origin); } catch (e) {}
  }

  // O monitor carrega depois (document_idle): ao chegar, pede o que já passou.
  window.addEventListener('message', function (ev) {
    if (ev.source !== window || !ev.data || ev.data.type !== 'PEPPA_HELLO') return;
    for (var i = 0; i < buffer.length; i++) {
      try { window.postMessage(buffer[i], window.location.origin); } catch (e) {}
    }
  });

  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var p = origFetch.apply(this, arguments);
      if (isChat(url)) {
        p.then(function (res) {
          res.clone().text().then(function (t) { emit(url, res.status, t); }).catch(function () {});
        }).catch(function () {});
      }
      return p;
    };
  }

  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__peppaUrl = String(url || '');
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var xhr = this;
    if (isChat(xhr.__peppaUrl)) {
      xhr.addEventListener('load', function () {
        var t = '';
        try { t = xhr.responseType === '' || xhr.responseType === 'text' ? xhr.responseText : JSON.stringify(xhr.response); } catch (e) {}
        emit(xhr.__peppaUrl, xhr.status, t);
      });
    }
    return origSend.apply(this, arguments);
  };
})();
