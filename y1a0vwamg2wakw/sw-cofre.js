'use strict';
// Cofre GrowAI: decifra no navegador as páginas deste site depois do login.
const ESCOPO = new URL(self.registration.scope).pathname;
let memoria = null;
function banco() {
  return new Promise((ok, falha) => {
    const r = indexedDB.open('growai-cofre', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('chaves');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
}
async function lerChave() {
  if (memoria && memoria.exp > Date.now()) return memoria.k;
  try {
    const db = await banco();
    const v = await new Promise((ok, falha) => {
      const r = db.transaction('chaves', 'readonly').objectStore('chaves').get(ESCOPO);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => falha(r.error);
    });
    db.close();
    if (!v || !(v.exp > Date.now())) return null;
    const k = await crypto.subtle.importKey('raw', v.k, 'AES-GCM', false, ['decrypt']);
    memoria = { k, exp: v.exp };
    return k;
  } catch (e) { return null; }
}
async function esquecer() {
  memoria = null;
  try {
    const db = await banco();
    await new Promise((ok) => { const t = db.transaction('chaves', 'readwrite'); t.objectStore('chaves').delete(ESCOPO); t.oncomplete = ok; t.onerror = ok; });
    db.close();
  } catch (e) {}
}
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function abrirTexto(k, t) {
  const u = b64(t.slice(6));
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, k, u.slice(12)));
}
async function abrirBytes(k, u) {
  if (u[0] === 71 && u[1] === 65 && u[2] === 67 && u[3] === 66 && u[4] === 1) {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(5, 17) }, k, u.slice(17)));
  }
  if (u.length > 6 && String.fromCharCode(...u.slice(0, 6)) === 'GACF1:') return abrirTexto(k, new TextDecoder().decode(u));
  return null;
}
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('message', (e) => { if (e.data === 'cofre-esquecer') esquecer(); if (e.data === 'cofre-reler') memoria = null; });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(ESCOPO)) return;
  const nome = url.pathname.slice(ESCOPO.length);
  if (nome === 'sw-cofre.js' || nome === 'cofre.json') return;
  e.respondWith(tratar(req, url));
});
async function tratar(req, url) {
  const pagina = req.mode === 'navigate' || req.destination === 'document' || req.destination === 'iframe';
  if (pagina && url.searchParams.has('sair')) await esquecer();
  const k = await lerChave();
  let resp;
  try {
    resp = pagina ? await fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }) : await fetch(req);
  } catch (e) { return fetch(req); }
  if (pagina && resp.redirected) return Response.redirect(resp.url, 302);
  if (!k || !resp.ok) return resp;
  try {
    const u = new Uint8Array(await resp.clone().arrayBuffer());
    const tipo = resp.headers.get('Content-Type') || 'application/octet-stream';
    if (pagina || tipo.indexOf('text/html') === 0) {
      const m = new TextDecoder().decode(u).match(/<script type="application\/octet-stream" id="cofre-dados">\s*(GACF1:[A-Za-z0-9+\/=]+)\s*<\/script>/);
      if (!m) return resp;
      const html = await abrirTexto(k, m[1]);
      return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    const claro = await abrirBytes(k, u);
    if (!claro) return resp;
    return new Response(claro, { status: 200, headers: { 'Content-Type': tipo, 'Cache-Control': 'no-store' } });
  } catch (e) {
    if (pagina) await esquecer();
    return resp;
  }
}
