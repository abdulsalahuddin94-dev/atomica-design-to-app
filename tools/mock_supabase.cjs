#!/usr/bin/env node
// Live Prototype (Screens_Handoff_Skill, step 4): a local stand-in for the Supabase REST API of prototype_comments,
// so the comment overlay and tools/prototype_comments.cjs can be tested before a Supabase project exists.
// Usage: node tools/mock_supabase.cjs --project <slug> [--port 54321] [--store <file.json>]
// Keys: anon = "mock-anon-key", service = "mock-service-key" (test values, never real keys).
// Same rules as Screens_Handoff_Skill/templates/supabase/schema.sql: the anon key may read and add open comments
// (project slug [a-z0-9-]); update and delete need the service key. --project only names the default slug. Supports the PostgREST subset the tools use:
// GET ?project=eq.x&screen=eq.y&status=eq.open&order=created_at.asc, POST (Prefer: return=representation), PATCH ?id=eq.x.
'use strict';
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PROJECT = opt('--project');
const PORT = Number(opt('--port', 54321));
const STORE = opt('--store', null);
const ANON = 'mock-anon-key';
const SERVICE = 'mock-service-key';
if (!PROJECT) { console.error('Usage: node tools/mock_supabase.cjs --project <slug> [--port 54321] [--store <file.json>]'); process.exit(2); }

let rows = [];
if (STORE && fs.existsSync(STORE)) rows = JSON.parse(fs.readFileSync(STORE, 'utf8'));
const save = () => { if (STORE) fs.writeFileSync(STORE, JSON.stringify(rows, null, 1)); };
const FIELDS = ['project', 'screen', 'figma_node', 'component', 'theme', 'lang', 'viewport', 'x', 'y', 'author', 'body', 'status', 'images'];
const files = {}; // Storage: '<bucket>/<path>' -> { type, data }
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function filters(url) {
  const f = [];
  let order = null;
  for (const [k, v] of url.searchParams) {
    if (k === 'select') continue;
    if (k === 'order') { order = v; continue; }
    const m = /^eq\.(.*)$/.exec(v);
    if (m) f.push([k, m[1]]);
  }
  return { match: (r) => f.every(([k, v]) => String(r[k]) === v), order };
}

function role(req) {
  const key = req.headers.apikey || (req.headers.authorization || '').replace(/^Bearer /, '');
  return key === SERVICE ? 'service' : key === ANON ? 'anon' : null;
}

function send(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}

function valid(c) {
  if (typeof c.body !== 'string' || !c.body.trim() || c.body.length > 2000) return 'body must be 1-2000 characters';
  if (c.author && String(c.author).length > 80) return 'author must be at most 80 characters';
  if (c.theme && !['Light', 'Dark'].includes(c.theme)) return 'theme must be Light or Dark';
  if (c.lang && !['en', 'ar'].includes(c.lang)) return 'lang must be en or ar';
  if (!c.screen) return 'screen is required';
  return null;
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'apikey,authorization,content-type,prefer,x-upsert' });
    return res.end();
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  // Storage (the bucket prototype-comments): public read; anon may add images under <slug>/<comment uuid>/ only.
  const pub = /^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (pub && req.method === 'GET') {
    const f = files[`${pub[1]}/${pub[2]}`];
    if (!f) return send(res, 404, { message: 'Object not found' });
    res.writeHead(200, { 'content-type': f.type, 'access-control-allow-origin': '*' });
    return res.end(f.data);
  }
  const up = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(url.pathname);
  if (up && req.method === 'POST') {
    const who2 = role(req);
    if (!who2) return send(res, 401, { message: 'Invalid API key' });
    const chunks = [];
    req.on('data', (d) => chunks.push(d));
    req.on('end', () => {
      const data = Buffer.concat(chunks);
      const type = (req.headers['content-type'] || '').split(';')[0];
      if (up[1] !== 'prototype-comments') return send(res, 404, { message: 'Bucket not found' });
      if (who2 === 'anon' && !/^[a-z0-9-]{1,64}\/[0-9a-f-]{36}\/[^/]+$/.test(up[2])) return send(res, 403, { message: 'new row violates row-level security policy' });
      if (!IMAGE_TYPES.includes(type)) return send(res, 415, { message: `mime type ${type} is not supported` });
      if (data.length > 5 * 1024 * 1024) return send(res, 413, { message: 'The object exceeded the maximum allowed size' });
      if (files[`${up[1]}/${up[2]}`]) return send(res, 409, { message: 'The resource already exists' });
      files[`${up[1]}/${up[2]}`] = { type, data };
      return send(res, 200, { Key: `${up[1]}/${up[2]}` });
    });
    return;
  }
  if (url.pathname !== '/rest/v1/prototype_comments') return send(res, 404, { message: 'not found' });
  const who = role(req);
  if (!who) return send(res, 401, { message: 'Invalid API key' });
  let raw = '';
  req.on('data', (d) => { raw += d; });
  req.on('end', () => {
    const { match, order } = filters(url);
    // RLS: the anon role only sees this project's rows
    const visible = rows.filter((r) => who === 'service' || /^[a-z0-9-]{1,64}$/.test(r.project));
    if (req.method === 'GET') {
      let out = visible.filter(match);
      if (order) {
        const [col, dir] = order.split('.');
        out = out.slice().sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
      }
      return send(res, 200, out);
    }
    let body;
    try { body = raw ? JSON.parse(raw) : {}; } catch (e) { return send(res, 400, { message: 'invalid JSON' }); }
    if (req.method === 'POST') {
      const list = Array.isArray(body) ? body : [body];
      const made = [];
      for (const c of list) {
        const row = Object.fromEntries(FIELDS.filter((k) => c[k] !== undefined).map((k) => [k, c[k]]));
        row.status = row.status || 'open';
        if (who === 'anon' && (!/^[a-z0-9-]{1,64}$/.test(row.project || '') || row.status !== 'open'))
          return send(res, 403, { message: 'new row violates row-level security policy for table "prototype_comments"' });
        const bad = valid(row);
        if (bad) return send(res, 400, { message: bad });
        if (Array.isArray(row.images) && row.images.length > 4) return send(res, 400, { message: 'at most 4 images' });
        const id = /^[0-9a-f-]{36}$/.test(c.id || '') ? c.id : crypto.randomUUID();
        made.push({ id, images: [], ...row, created_at: new Date().toISOString(), resolved_at: null });
      }
      rows.push(...made);
      save();
      return send(res, 201, (req.headers.prefer || '').includes('return=representation') ? made : undefined);
    }
    if (req.method === 'PATCH' || req.method === 'DELETE') {
      if (who !== 'service') return send(res, 403, { message: 'permission denied for table prototype_comments' });
      const hit = rows.filter(match);
      if (req.method === 'DELETE') rows = rows.filter((r) => !hit.includes(r));
      else for (const r of hit) for (const k of ['status', 'resolved_at', 'body', 'reply']) if (body[k] !== undefined) r[k] = body[k];
      save();
      return send(res, 200, hit);
    }
    return send(res, 405, { message: 'method not allowed' });
  });
}).listen(PORT, () => console.log(`Mock Supabase for "${PROJECT}" on http://localhost:${PORT} (anon key mock-anon-key, service key mock-service-key)`));
