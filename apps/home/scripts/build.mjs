import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = fileURLToPath(new URL('../', import.meta.url))
const fragment = fs.readFileSync(path.join(app, 'home-content.html'), 'utf8')
if (/<script\b|\son[a-z]+\s*=|javascript:/i.test(fragment)) throw new Error('Home content must work without scripts or event handlers')
const dist = path.join(app, 'dist')
fs.mkdirSync(dist, { recursive: true })
fs.writeFileSync(path.join(dist, 'home-content.html'), fragment)
fs.writeFileSync(path.join(dist, 'index.html'), `<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>Sub2API · Codex 与图像创作</title><style>html,body{margin:0;padding:0;background:#fff}body{min-width:320px}</style></head><body>\n${fragment}\n</body></html>\n`)
console.log('Built dist/home-content.html (paste into sub2api) and dist/index.html (preview).')
