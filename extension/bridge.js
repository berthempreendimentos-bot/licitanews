// PEPPACORP Monitor — ponte com a aba do PEPPACORP.
// Repassa à página do app as mensagens capturadas (modo demonstração, dados no
// navegador) e recebe da página o pedido "Conectar extensão" (endereço + chave).
(function () {
  'use strict';
  if (window.__PEPPA_BRIDGE__) return;
  window.__PEPPA_BRIDGE__ = true;

  var VERSION = chrome.runtime.getManifest().version;
  var pending = {};
  var seq = 0;

  // Anuncia a presença da extensão por mensagem (não mexe no HTML: o React
  // acusaria diferença entre o HTML do servidor e o da página).
  function announce() {
    chrome.storage.local.get(['peppa_server', 'peppa_key'], function (cfg) {
      window.postMessage({
        type: 'PEPPA_EXT_HELLO', version: VERSION,
        server: cfg.peppa_server || null, keyTail: cfg.peppa_key ? String(cfg.peppa_key).slice(-6) : null,
      }, window.location.origin);
    });
  }
  announce();
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && (changes.peppa_server || changes.peppa_key)) announce();
  });

  window.addEventListener('message', function (ev) {
    if (ev.source !== window || !ev.data) return;
    var d = ev.data;
    if (d.type === 'PEPPA_EXT_PING') { announce(); return; }
    if (d.type === 'PEPPA_EXT_CONNECT') {
      // Confirmação da pessoa: um site qualquer não pode redirecionar o chat dos pregões para ele.
      if (!window.confirm('Conectar a extensão PEPPACORP Monitor a ' + window.location.origin + '?\n\nO chat dos pregões monitorados passará a ser enviado para este endereço.')) {
        window.postMessage({ type: 'PEPPA_EXT_CONNECT_RESULT', ok: false, error: 'Conexão cancelada.' }, window.location.origin);
        return;
      }
      chrome.runtime.sendMessage({ action: 'peppa_save_config', server: window.location.origin, key: d.key }, function (resp) {
        window.postMessage({ type: 'PEPPA_EXT_CONNECT_RESULT', ok: !!(resp && resp.ok), error: resp && resp.error }, window.location.origin);
      });
      return;
    }
    if (d.type === 'PEPPA_EXT_OPEN') {
      chrome.runtime.sendMessage({ action: 'peppa_open', url: d.url, show: !!d.show }, function (resp) {
        window.postMessage({ type: 'PEPPA_EXT_OPEN_RESULT', reqId: d.reqId, ok: !!(resp && resp.ok), already_open: !!(resp && resp.already_open), shown: !!(resp && resp.shown) }, window.location.origin);
      });
      return;
    }
    if (d.type === 'PEPPA_EXT_SILENCE') { chrome.runtime.sendMessage({ action: 'peppa_silence' }); return; }
    if (d.type === 'PEPPA_EXT_TEST_ALARM') { chrome.runtime.sendMessage({ action: 'peppa_test_alarm', alertas: d.alertas }); return; }
    if (d.type === 'PEPPA_EXT_ALARM_STATUS') {
      chrome.runtime.sendMessage({ action: 'peppa_alarm_status' }, function (r) {
        window.postMessage({ type: 'PEPPA_EXT_ALARM', on: !!(r && r.on) }, window.location.origin);
      });
      return;
    }
    if (d.type === 'PEPPA_EXT_INGEST_RESULT' && pending[d.reqId]) {
      pending[d.reqId](d.result);
      delete pending[d.reqId];
    }
  });

  chrome.runtime.onMessage.addListener(function (req, sender, sendResponse) {
    if (req.action === 'peppa_alarm_state') {
      window.postMessage({ type: 'PEPPA_EXT_ALARM', on: !!req.on }, window.location.origin);
      return false;
    }
    if (req.action !== 'peppa_bridge_ingest') return false;
    var reqId = 'r' + (++seq) + '-' + Date.now();
    var timer = setTimeout(function () {
      if (!pending[reqId]) return;
      delete pending[reqId];
      sendResponse({ ok: false, error: 'a aba do PEPPACORP não respondeu' });
    }, 10000);
    pending[reqId] = function (result) { clearTimeout(timer); sendResponse(result || { ok: false, error: 'sem resposta' }); };
    window.postMessage({
      type: 'PEPPA_EXT_INGEST', reqId: reqId, key: req.key, codigo_compra: req.codigo_compra, messages: req.messages,
    }, window.location.origin);
    return true;
  });
})();
