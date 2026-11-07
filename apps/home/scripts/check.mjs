// Read-only browser verification: replace public settings inside this browser only.
// All non-GET/HEAD network requests are blocked. No admin login or server writes.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const app = fileURLToPath(new URL('../', import.meta.url))
const fragment = fs.readFileSync(path.join(app, 'home-content.html'), 'utf8')
const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(app, 'test-results')
fs.mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.DRAW_CHROMIUM_PATH, headless: true })
const errors = [], blockedWrites = [], checks = []
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    if (!['GET','HEAD'].includes(route.request().method())) {
      blockedWrites.push(new URL(route.request().url()).pathname)
      return route.abort()
    }
    return route.continue()
  })
  let injected = false
  await page.route('https://sub.velunest.top/home', async route => {
    const response = await route.fetch()
    let html = await response.text()
    html = html.replace(/(window\.__APP_CONFIG__=)([\s\S]*?)(;<\/script>)/, (_match, prefix, json, suffix) => {
      const settings = JSON.parse(json)
      settings.home_content = fragment
      injected = true
      return prefix + JSON.stringify(settings).replace(/</g, '\\u003c') + suffix
    })
    await route.fulfill({response,body:html})
  })
  await page.route('**/api/v1/settings/public', async route => {
    const response = await route.fetch()
    const body = await response.json()
    const settings = body.data ?? body
    settings.home_content = fragment
    injected = true
    await route.fulfill({ response, json: body })
  })
  await page.goto('https://sub.velunest.top/home', { waitUntil: 'networkidle', timeout: 60_000 })
  await page.locator('#vn-home').waitFor()
  if (!injected) throw new Error('Homepage settings were not intercepted')
  await page.locator('#vn-home img').evaluateAll(images => Promise.all(images.map(img => img.decode())))
  for (const [name,width,height] of [['desktop',1440,1050],['mobile',375,812],['tablet',768,1024],['landscape',844,390]]) {
    await page.setViewportSize({width,height})
    const state = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      imagesLoaded: [...document.querySelectorAll('#vn-home img')].every(img => img.complete && img.naturalWidth > 0),
      headings: document.querySelectorAll('#vn-home h1').length,
      background: getComputedStyle(document.querySelector('#vn-home')).backgroundColor,
      links: [...document.querySelectorAll('#vn-home a')].map(a => a.getAttribute('href')),
    }))
    if (state.overflow || !state.imagesLoaded || state.headings !== 1 || state.background !== 'rgb(255, 255, 255)') throw new Error(`Layout check failed: ${name}: ${JSON.stringify(state)}`)
    if (state.links.some(href => !href.startsWith('#') && !/^https:\/\/sub\.velunest\.top\/(home|login|draw\/)$/u.test(href))) throw new Error('Unexpected navigation target')
    checks.push({name,width,height,...state})
    if (name !== 'landscape') await page.screenshot({path:path.join(output,`${name}.png`),fullPage:true,animations:'disabled'})
  }
  await page.setViewportSize({width:1440,height:1050})
  await page.getByRole('link',{name:'支持能力',exact:true}).click()
  if (!page.url().endsWith('#vn-supported')) throw new Error('Section navigation failed')
  await page.locator('html').evaluate(html => html.classList.add('dark'))
  const darkHostBackground = await page.locator('#vn-home').evaluate(el => getComputedStyle(el).backgroundColor)
  if (darkHostBackground !== 'rgb(255, 255, 255)') throw new Error('Host dark theme overrides homepage')
  await page.locator('html').evaluate(html => html.style.fontSize = '20px')
  await page.setViewportSize({width:375,height:812})
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Scaled host text overflows')
  await page.locator('.vn-skip').focus()
  const focus = await page.locator('.vn-skip').evaluate(el => ({active:document.activeElement===el,top:el.getBoundingClientRect().top}))
  if (!focus.active || focus.top < 0) throw new Error('Skip-link keyboard focus is inaccessible')
  if (errors.length) throw new Error(errors.join('\n'))
  const report = {ok:true,mode:'browser-only public-settings override; no server changes',blockedWrites,checks,darkHostBackground,keyboardSkipLink:focus,errors}
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify(report))
} finally { await browser.close() }
