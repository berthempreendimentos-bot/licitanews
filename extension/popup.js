// PEPPACORP Monitor — popup de configuração.
var $ = function (id) { return document.getElementById(id); };
$('ver').textContent = 'v' + chrome.runtime.getManifest().version;

function show(ok, text) {
  $('status').className = 'status ' + (ok ? 'ok' : 'err');
  $('status').textContent = text;
}

chrome.storage.local.get(['peppa_server', 'peppa_key'], function (cfg) {
  var s = (cfg && cfg.peppa_server) || '';
  if (!s) {
    chrome.tabs.query({}, function (tabs) {
      var peppa = tabs.find(function (t) {
        return t.url && (/^(http:\/\/(localhost|127\.0\.0\.1|192\.168\.18\.28)(:\d+)?|https:\/\/[^/]+\.vercel\.app)\//.test(t.url));
      });
      if (peppa && peppa.url) {
        try { $('server').value = new URL(peppa.url).origin; } catch (e) {}
      } else {
        $('server').value = 'http://localhost:3000';
      }
    });
  } else {
    $('server').value = s;
  }
  $('key').value = (cfg && cfg.peppa_key) || '';
});

$('save').addEventListener('click', function () {
  var server = ($('server').value || '').trim().replace(/\/+$/, '') || 'http://localhost:3000';
  var key = ($('key').value || '').trim();
  if (!/^https?:\/\//.test(server)) {
    show(false, 'Informe uma URL válida (ex: http://localhost:3000)');
    return;
  }
  if (!key || key.length < 16) {
    show(false, 'O token deve ter pelo menos 16 caracteres.');
    return;
  }
  chrome.runtime.sendMessage({ action: 'peppa_save_config', server: server, key: key }, function (resp) {
    if (!resp || !resp.ok) { show(false, (resp && resp.error) || 'Falha ao salvar.'); return; }
    show(true, 'Salvo com sucesso! Recarregue a página do Comprasnet.');
  });
});

$('test').addEventListener('click', function () {
  var server = ($('server').value || '').trim().replace(/\/+$/, '') || 'http://localhost:3000';
  var key = ($('key').value || '').trim();
  if (!key || key.length < 16) {
    show(false, 'Preencha o token de acesso antes de testar.');
    return;
  }
  show(true, 'Testando conexão…');
  chrome.runtime.sendMessage({ action: 'peppa_save_config', server: server, key: key }, function () {
    chrome.runtime.sendMessage({ action: 'peppa_test' }, function (resp) {
      if (!resp || !resp.ok) { show(false, 'Erro: ' + ((resp && resp.error) || 'sem resposta do servidor')); return; }
      show(true, 'Conectado ao PEPPACORP com sucesso!');
    });
  });
});

// Alarme tocando: mostra o botão de silenciar.
chrome.runtime.sendMessage({ action: 'peppa_alarm_status' }, function (r) {
  if (r && r.on) $('silence').style.display = 'block';
});
$('silence').addEventListener('click', function () {
  chrome.runtime.sendMessage({ action: 'peppa_silence' }, function () {
    $('silence').style.display = 'none';
    show(true, 'Alarme silenciado.');
  });
});
