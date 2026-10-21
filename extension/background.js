// PEPPACORP Monitor — service worker.
// Entrega as mensagens capturadas ao PEPPACORP:
//  1. POST {servidor}/api/monitoramento/ingest com a chave de ingestão (modo nuvem, Supabase).
//  2. Se o servidor estiver em modo demonstração (503), entrega à aba do PEPPACORP aberta
//     neste navegador (ponte), que grava nos dados locais com as mesmas regras.

function getConfig() {
  return chrome.storage.local.get(['peppa_server', 'peppa_key']);
}

function originOf(url) {
  try { return new URL(url).origin; } catch (e) { return null; }
}

async function viaServer(cfg, codigo, messages) {
  const r = await fetch(cfg.peppa_server.replace(/\/+$/, '') + '/api/monitoramento/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ingest-key': cfg.peppa_key },
    body: JSON.stringify({ codigo_compra: codigo, messages: messages }),
  });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { /* resposta não-JSON */ }
  return { status: r.status, data: data };
}

// Endereços onde a ponte (bridge.js) roda — mesma lista do manifesto.
// Endereços onde a ponte (bridge.js) roda pelo manifesto: local, rede e Vercel.
const BRIDGE_HOSTS = /^(http:\/\/(localhost|127\.0\.0\.1|[^/]+\.localhost|192\.168\.18\.28)(:\d+)?|https:\/\/[^/]+\.vercel\.app)\//;
// Domínio próprio do PEPPACORP (ex.: licita.suaempresa.com.br), configurado no popup.
let servidorOrigem = null;
chrome.storage.local.get('peppa_server').then((c) => { servidorOrigem = originOf(c.peppa_server || ''); });
chrome.storage.onChanged.addListener((m, area) => { if (area === 'local' && m.peppa_server) servidorOrigem = originOf(m.peppa_server.newValue || ''); });
const ehPeppacorp = (url) => !!url && (BRIDGE_HOSTS.test(url) || (!!servidorOrigem && originOf(url) === servidorOrigem));

/** Domínio fora do manifesto: registra a ponte nele (precisa da permissão concedida no popup). */
async function registrarPonte(server) {
  const origem = originOf(server);
  if (!origem || BRIDGE_HOSTS.test(origem + '/')) return;
  if (!(await chrome.permissions.contains({ origins: [origem + '/*'] }))) return;
  await chrome.scripting.unregisterContentScripts({ ids: ['ponte-dominio'] }).catch(() => {});
  await chrome.scripting.registerContentScripts([{ id: 'ponte-dominio', matches: [origem + '/*'], js: ['bridge.js'], runAt: 'document_start' }]);
}

async function viaBridge(cfg, codigo, messages) {
  const origin = originOf(cfg.peppa_server);
  // As mensagens (e a chave) só vão para a aba do endereço configurado ou para o PEPPACORP local
  // (ex.: o sistema mudou de porta). Nunca para outro site *.vercel.app: qualquer um publica lá.
  const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1|[^/]+\.localhost|192\.168\.18\.28)(:\d+)?\//;
  const tabs = (await chrome.tabs.query({})).filter((t) => t.url && (originOf(t.url) === origin || (LOCAL.test(t.url) && LOCAL.test(origin + '/'))));
  // Primeiro a aba do endereço configurado. Cada aba confere a chave antes de gravar.
  tabs.sort((a, b) => (originOf(b.url) === origin) - (originOf(a.url) === origin));
  let lastError = null;
  const msg = { action: 'peppa_bridge_ingest', key: cfg.peppa_key, codigo_compra: codigo, messages: messages };
  for (const tab of tabs) {
    let resp = null;
    try {
      resp = await chrome.tabs.sendMessage(tab.id, msg);
    } catch (e) {
      // Aba aberta antes da instalação/atualização: injeta a ponte e tenta de novo.
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['bridge.js'] });
        resp = await chrome.tabs.sendMessage(tab.id, msg);
      } catch (e2) { /* não é o PEPPACORP ou a aba não aceita scripts */ }
    }
    if (resp && resp.ok) return resp;
    if (resp) lastError = resp.error;
  }
  if (lastError) return { ok: false, error: lastError };
  if (!tabs.length) return { ok: false, error: 'abra o PEPPACORP (' + origin + ') neste navegador' };
  return { ok: false, error: 'recarregue a aba do PEPPACORP (F5)' };
}

async function ingest(codigo, messages) {
  const cfg = await getConfig();
  if (!cfg.peppa_server || !cfg.peppa_key) return { ok: false, error: 'extensão não conectada' };
  let res;
  try {
    res = await viaServer(cfg, codigo, messages);
  } catch (e) {
    return { ok: false, error: 'PEPPACORP fora do ar (' + (e && e.message || e) + ')' };
  }
  if (res.status === 503) {
    const b = await viaBridge(cfg, codigo, messages);
    if (b.ok) b.via = 'ponte';
    return b;
  }
  if (res.status === 401) return { ok: false, error: 'token inválido' };
  if (res.status < 200 || res.status >= 300) return { ok: false, error: (res.data && res.data.error) || 'HTTP ' + res.status };
  return { ok: true, via: 'servidor', data: res.data || {} };
}

// Abre o acompanhamento da compra numa janela minimizada e sem som, reaproveitada
// para todas as compras. Se a compra já estiver aberta em alguma aba, não abre de novo.
// show = true (botão "Abrir no Comprasnet"): mostra a aba para a pessoa ver o portal.
// janela = 0, 1, 2… (ciclo do administrador): cada número tem a sua janela minimizada.
async function openComprasnet(url, show, janela) {
  let u;
  try { u = new URL(url); } catch (e) { return { ok: false, error: 'link inválido' }; }
  const code = u.searchParams.get('compra');
  if (u.hostname !== 'cnetmobile.estaleiro.serpro.gov.br' || !/^\d{10,}$/.test(code || '')) return { ok: false, error: 'link inválido' };
  const tabs = await chrome.tabs.query({});
  const open = tabs.find((t) => t.url && t.url.indexOf('compra=' + code) !== -1);
  if (open) {
    if (show) {
      await chrome.windows.update(open.windowId, { state: 'normal', focused: true });
      await chrome.tabs.update(open.id, { active: true });
    }
    return { ok: true, already_open: true, shown: !!show };
  }
  if (show) {
    const tab = await chrome.tabs.create({ url: url, active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    return { ok: true, shown: true };
  }
  const chave = Number.isInteger(janela) && janela >= 0 ? 'peppa_window_' + janela : 'peppa_window';
  const salvo = (await chrome.storage.session.get(chave))[chave];
  if (salvo) {
    try {
      await chrome.windows.get(salvo);
      const tab = await chrome.tabs.create({ windowId: salvo, url: url, active: false });
      await chrome.tabs.update(tab.id, { muted: true });
      return { ok: true };
    } catch (e) { /* janela fechada (pelo usuário ou ao fechar a última aba): cria outra */ }
  }
  const w = await chrome.windows.create({ url: url, state: 'minimized' });
  await chrome.storage.session.set({ [chave]: w.id });
  if (w.tabs && w.tabs[0]) await chrome.tabs.update(w.tabs[0].id, { muted: true });
  return { ok: true };
}

// ===== Avisos: pop-up do Windows e alarme sonoro =====
// A configuração (quais eventos, som, volume, repetir) vem do PEPPACORP junto com a resposta da ingestão.
const ALARME_PADRAO = { popup: true, som: true, tipo_som: 'sirene', volume: 0.8, repetir: true };

async function ensureOffscreen() {
  const ctxs = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (ctxs.length) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html', reasons: ['AUDIO_PLAYBACK'], justification: 'Alarme sonoro de mensagens do pregão',
  });
}

async function setAlarmState(on) {
  await chrome.storage.session.set({ peppa_alarm_on: on });
  chrome.action.setBadgeText({ text: on ? '!' : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
  // Avisa as abas do PEPPACORP (mostram a faixa "Silenciar alarme").
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    if (ehPeppacorp(t.url)) chrome.tabs.sendMessage(t.id, { action: 'peppa_alarm_state', on: on }).catch(() => {});
  }
}

async function startAlarm(cfg) {
  await ensureOffscreen();
  await chrome.runtime.sendMessage({ target: 'offscreen', action: 'play', tipo: cfg.tipo_som, volume: cfg.volume, repetir: cfg.repetir });
  await setAlarmState(true);
}

async function stopAlarm() {
  chrome.runtime.sendMessage({ target: 'offscreen', action: 'stop' }).catch(() => {});
  await setAlarmState(false);
}

function avisar(codigo, data) {
  const cfg = Object.assign({}, ALARME_PADRAO, (data && data.alertas) || {});
  let lista = (data && data.disparos) || null;
  // Servidor antigo (sem "disparos"): avisa só as menções, como antes.
  if (!lista) {
    lista = ((data && data.mentions) || []).map((m) => ({
      tipo: 'Menção', titulo: 'Menção a "' + (m.termo_encontrado || '') + '" — compra ' + codigo, mensagem: m.texto,
    }));
  }
  if (!lista.length) return;
  if (cfg.popup) {
    const um = lista.length === 1;
    chrome.notifications.create('peppa-' + codigo + '-' + Date.now(), {
      type: 'basic', iconUrl: 'icon.png', priority: 2, requireInteraction: true,
      title: um ? lista[0].titulo : lista.length + ' avisos novos — compra ' + codigo,
      message: um
        ? String(lista[0].mensagem || '').slice(0, 200)
        : lista.slice(0, 3).map((d) => '• ' + d.tipo + ': ' + String(d.mensagem || '').slice(0, 60)).join('\n'),
      buttons: cfg.som ? [{ title: '🔇 Silenciar alarme' }] : [],
    });
  }
  if (cfg.som) startAlarm(cfg).catch(() => {});
}

// ===== Alarme para todos os usuários =====
// Quem captura é a extensão do administrador. A de cada usuário busca aqui, a cada 30 s,
// os avisos das licitações dele e toca o alarme / mostra o pop-up.
chrome.alarms.create('peppa-avisos', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'peppa-avisos') buscarAvisos().catch(() => {}); });

async function buscarAvisos() {
  const cfg = await getConfig();
  if (!cfg.peppa_server || !cfg.peppa_key) return;
  const { peppa_avisos_desde: desde } = await chrome.storage.local.get('peppa_avisos_desde');
  const url = cfg.peppa_server.replace(/\/+$/, '') + '/api/monitoramento/avisos' + (desde ? '?desde=' + encodeURIComponent(desde) : '');
  const r = await fetch(url, { headers: { 'x-ingest-key': cfg.peppa_key } });
  if (!r.ok) return;
  const d = await r.json();
  if (d.desde) await chrome.storage.local.set({ peppa_avisos_desde: d.desde });
  const porCompra = {};
  for (const x of d.disparos || []) (porCompra[x.codigo_compra] = porCompra[x.codigo_compra] || []).push(x);
  for (const codigo of Object.keys(porCompra)) avisar(codigo, { disparos: porCompra[codigo], alertas: d.alertas });
}

// Clicar no pop-up (ou no botão) silencia; o clique no corpo também leva para o PEPPACORP.
chrome.notifications.onButtonClicked.addListener(() => { stopAlarm(); });
chrome.notifications.onClicked.addListener(async (id) => {
  stopAlarm();
  chrome.notifications.clear(id);
  if (id.indexOf('peppa-captcha-') === 0) return;
  const tabs = (await chrome.tabs.query({})).filter((t) => ehPeppacorp(t.url));
  if (tabs[0]) {
    chrome.windows.update(tabs[0].windowId, { focused: true }).catch(() => {});
    chrome.tabs.update(tabs[0].id, { active: true }).catch(() => {});
  }
});

// Ao instalar/atualizar, carrega os scripts nas abas que já estavam abertas
// (sem isso seria preciso dar F5 no PEPPACORP e no Comprasnet).
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url) continue;
    const target = { tabId: tab.id };
    if (ehPeppacorp(tab.url)) {
      chrome.scripting.executeScript({ target, files: ['bridge.js'] }).catch(() => {});
    } else if (/^https:\/\/([^/]+\.)?gov\.br\//.test(tab.url)) {
      chrome.scripting.executeScript({ target, files: ['probe.js'], world: 'MAIN' })
        .then(() => chrome.scripting.executeScript({ target, files: ['monitor.js'] }))
        .catch(() => {});
    }
  }
});

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === 'peppa_ingest') {
    ingest(String(req.codigo_compra || ''), Array.isArray(req.messages) ? req.messages : [])
      .then((r) => {
        if (r.ok) avisar(req.codigo_compra, r.data);
        sendResponse(r);
      })
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true;
  }
  if (req.action === 'peppa_save_config') {
    const server = String(req.server || '').trim().replace(/\/+$/, '');
    const key = String(req.key || '').trim();
    if (!/^https?:\/\//.test(server) || key.length < 16) {
      sendResponse({ ok: false, error: 'Endereço do PEPPACORP ou token inválidos.' });
      return false;
    }
    // Outra conta/endereço: os avisos recomeçam a partir de agora.
    chrome.storage.local.remove('peppa_avisos_desde');
    chrome.storage.local.set({ peppa_server: server, peppa_key: key }, () => {
      registrarPonte(server).catch(() => {}).finally(() => { sendResponse({ ok: true }); buscarAvisos().catch(() => {}); });
    });
    return true;
  }
  if (req.action === 'peppa_capture_state') {
    // Andamento da captura de uma compra: repassa às abas do PEPPACORP (ciclo do administrador).
    chrome.tabs.query({}).then((tabs) => {
      for (const t of tabs) {
        if (ehPeppacorp(t.url)) chrome.tabs.sendMessage(t.id, { action: 'peppa_capture_state', codigo_compra: req.codigo_compra, estado: req.estado, synced: req.synced }).catch(() => {});
      }
    });
    return false;
  }
  if (req.action === 'peppa_capture_reset') {
    // Pede às abas da compra que avisem de novo o estado da captura.
    // Aba com o script antigo (extensão atualizada depois que ela abriu) não responde: recarrega.
    const code = String(req.codigo_compra || '');
    chrome.tabs.query({}).then((tabs) => {
      for (const t of tabs) {
        if (!t.url || t.url.indexOf('cnetmobile.estaleiro.serpro.gov.br') === -1 || t.url.indexOf('compra=' + code) === -1) continue;
        chrome.tabs.sendMessage(t.id, { action: 'peppa_capture_reset', codigo_compra: code }).catch(() => chrome.tabs.reload(t.id).catch(() => {}));
      }
    });
    return false;
  }
  if (req.action === 'peppa_close') {
    // Fecha as abas da compra (o ciclo do administrador fecha as que ele mesmo abriu).
    const code = String(req.codigo_compra || '');
    if (!/^\d{10,}$/.test(code)) { sendResponse({ ok: false }); return false; }
    chrome.tabs.query({}).then(async (tabs) => {
      const ids = tabs.filter((t) => t.url && t.url.indexOf('cnetmobile.estaleiro.serpro.gov.br') !== -1 && t.url.indexOf('compra=' + code) !== -1).map((t) => t.id);
      if (ids.length) await chrome.tabs.remove(ids).catch(() => {});
      sendResponse({ ok: true, closed: ids.length });
    });
    return true;
  }
  if (req.action === 'peppa_captcha' && sender.tab) {
    // O portal pediu verificação humana: mostra a aba para a pessoa resolver.
    chrome.windows.update(sender.tab.windowId, { state: 'normal', focused: true }).catch(() => {});
    chrome.tabs.update(sender.tab.id, { active: true }).catch(() => {});
    chrome.notifications.create('peppa-captcha-' + req.codigo_compra, {
      type: 'basic', iconUrl: 'icon.png', priority: 2,
      title: 'Comprasnet pediu verificação — compra ' + req.codigo_compra,
      message: 'Resolva o captcha na janela do Comprasnet para o monitor continuar capturando o chat.',
    });
    return false;
  }
  if (req.action === 'peppa_open') {
    openComprasnet(String(req.url || ''), !!req.show, req.janela).then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (req.action === 'peppa_silence' || req.action === 'peppa_alarm_finished') {
    stopAlarm().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (req.action === 'peppa_alarm_status') {
    chrome.storage.session.get('peppa_alarm_on').then((d) => sendResponse({ on: !!d.peppa_alarm_on }));
    return true;
  }
  if (req.action === 'peppa_test_alarm') {
    const cfg = Object.assign({}, ALARME_PADRAO, req.alertas || {});
    avisar('TESTE', { alertas: cfg, disparos: [{
      tipo: 'Teste', titulo: 'Teste de alarme — PEPPACORP',
      mensagem: 'É assim que você será avisado quando chegar uma mensagem importante no chat.',
    }] });
    sendResponse({ ok: true });
    return false;
  }
  if (req.action === 'peppa_test') {
    // Uma compra que não existe só confirma que servidor e chave respondem.
    ingest('0000000000', [])
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  return false;
});
