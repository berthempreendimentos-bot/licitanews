// PEPPACORP Monitor — popup de configuração.
var $ = function (id) { return document.getElementById(id); };
$('ver').textContent = 'v' + chrome.runtime.getManifest().version;

function show(ok, text) {
  $('status').className = 'status ' + (ok ? 'ok' : 'err');
  $('status').textContent = text;
}

chrome.storage.local.get('peppa_key', function (cfg) {
  $('key').value = (cfg && cfg.peppa_key) || '';
});

$('save').addEventListener('click', function () {
  var key = ($('key').value || '').trim();
  if (!key || key.length < 16) {
    show(false, 'O token deve ter pelo menos 16 caracteres.');
    return;
  }
  chrome.runtime.sendMessage({ action: 'peppa_save_config', key: key }, function (resp) {
    if (!resp || !resp.ok) { show(false, (resp && resp.error) || 'Falha ao salvar.'); return; }
    show(true, 'Salvo com sucesso! Recarregue a página do Comprasnet.');
  });
});

$('test').addEventListener('click', function () {
  show(true, 'Testando conexão…');
  chrome.runtime.sendMessage({ action: 'peppa_test' }, function (resp) {
    if (!resp || !resp.ok) { show(false, 'Erro: ' + ((resp && resp.error) || 'sem resposta do servidor')); return; }
    show(true, 'Conectado ao PEPPACORP com sucesso!');
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
