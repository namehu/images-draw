import http from 'node:http'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('../home-content.html', import.meta.url))
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:5174')
  if (url.pathname !== '/' && url.pathname !== '/home') { res.writeHead(404); res.end('Not found'); return }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sub2API 首页预览</title><style>html,body{margin:0;padding:0;background:#fff}</style></head><body>${fs.readFileSync(source,'utf8')}</body></html>`)
})
server.listen(5174, '127.0.0.1', () => console.log('Homepage preview: http://127.0.0.1:5174 — refresh after editing.'))
