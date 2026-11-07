import { chromium } from '@playwright/test'
import fs from 'node:fs'
const output = process.argv[2]
fs.mkdirSync(output, { recursive: true })
const raw = process.argv[3] ? fs.readFileSync(process.argv[3], 'utf8') : ''
const key = raw.match(/^DRAW_TEST_API_KEY\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '')
const browser = await chromium.launch({ executablePath: process.env.DRAW_CHROMIUM_PATH, headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 })
  const errors = []; const failedResources = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => { if (response.url().includes('/draw/') && response.status() >= 400) failedResources.push({path:new URL(response.url()).pathname,status:response.status()}) })
  const response = await page.goto('https://sub.velunest.top/draw/', { waitUntil: 'networkidle', timeout: 60_000 })
  await page.getByRole('heading', { name: '图像', exact: true }).waitFor()
  await page.locator('.template-card img').first().waitFor()
  if (await page.locator('.template-card').count() !== 10) throw new Error('Missing template cards')
  const imagesLoaded = await page.locator('.template-card img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: '查看理想小屋模板' }).click()
  await page.screenshot({ path: `${output}/template.png`, animations: 'disabled' })
  await page.keyboard.press('Escape')
  let modelValidation = 'skipped'
  if (key) {
    await page.getByRole('button', { name: '连接 API', exact: true }).click()
    await page.getByLabel('API Key', { exact: true }).fill(key)
    await page.getByRole('button', { name: '连接并验证' }).click()
    await page.getByRole('button', { name: '开始创作' }).click()
    modelValidation = 'passed'
    await page.getByRole('button', { name: '已连接', exact: true }).click()
    await page.getByRole('button', { name: '清除连接' }).click()
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.screenshot({ path: `${output}/mobile.png`, animations: 'disabled' })
  const report = { status:response.status(), imagesLoaded, modelValidation, errors, failedResources, horizontalOverflow:await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), csp:response.headers()['content-security-policy'] }
  fs.writeFileSync(`${output}/smoke-test.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
  if (report.status !== 200 || !imagesLoaded || errors.length || failedResources.length || report.horizontalOverflow) process.exitCode=1
} catch (error) { console.error(key ? String(error.message).split(key).join('[redacted]') : error.message); process.exitCode = 1 }
finally { await browser.close() }
