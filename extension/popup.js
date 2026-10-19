// PEPPACORP Monitor — popup de configuração.
var $ = function (id) { return document.getElementById(id); };
$('ver').textContent = 'v' + chrome.runtime.getManifest().version;

function show(ok, text) {
  $('status').className = 'status ' + (ok ? 'ok' : 'err');
  $('status').textContent = text;
}

chrome.storage.local.get(['peppa_server', 'peppa_key'], function (cfg) {
  $('server').value = cfg.peppa_server || '';
  $('key').value = cfg.peppa_key || '';
});

// Endereços fora da lista do manifesto (ex.: o PEPPACORP publicado) pedem permissão uma vez.
// Chamado direto no clique: o Chrome só mostra o pedido durante um gesto do usuário.
function ensurePermission(server, cb) {
  var origin;
  try { origin = new URL(server).origin + '/*'; } catch (e) { cb(false); return; }
  chrome.permissions.request({ origins: [origin] }, function (granted) { cb(!!granted); });
}

$('save').addEventListener('click', function () {
  var server = $('server').value.trim();
  var key = $('key').value.trim();
  ensurePermission(server, function (allowed) {
    if (!allowed) { show(false, 'Sem permissão para acessar ' + server + '.'); return; }
    chrome.runtime.sendMessage({ action: 'peppa_save_config', server: server, key: key }, function (resp) {
      if (!resp || !resp.ok) { show(false, (resp && resp.error) || 'Falha ao salvar.'); return; }
      show(true, 'Salvo. Recarregue a página de acompanhamento do Comprasnet.');
    });
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
