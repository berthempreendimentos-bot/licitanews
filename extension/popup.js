// PEPPACORP Monitor — popup de configuração.
var $ = function (id) { return document.getElementById(id); };
$('ver').textContent = 'v' + chrome.runtime.getManifest().version;

function show(ok, text) {
  $('status').className = 'status ' + (ok ? 'ok' : 'err');
  $('status').textContent = text;
}

// Configuração manual: só o token. O endereço é sempre o PEPPACORP publicado
// (o botão "Conectar extensão" de Conectar Robô continua usando o endereço da aba).
var SERVIDOR = 'https://licitanews.vercel.app';

chrome.storage.local.get(['peppa_key'], function (cfg) {
  $('key').value = cfg.peppa_key || '';
});

$('save').addEventListener('click', function () {
  var key = $('key').value.trim();
  chrome.runtime.sendMessage({ action: 'peppa_save_config', server: SERVIDOR, key: key }, function (resp) {
    if (!resp || !resp.ok) { show(false, (resp && resp.error) || 'Falha ao salvar.'); return; }
    show(true, 'Salvo. Recarregue a página de acompanhamento do Comprasnet.');
  });
});

$('test').addEventListener('click', function () {
  show(true, 'Testando…');
  chrome.runtime.sendMessage({ action: 'peppa_test' }, function (resp) {
    if (!resp || !resp.ok) { show(false, 'Falhou: ' + ((resp && resp.error) || 'sem resposta')); return; }
    show(true, 'Conectado ao PEPPACORP (' + (resp.via === 'ponte' ? 'modo demonstração, pela aba aberta' : 'servidor') + ').');
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
