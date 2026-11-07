import { chromium } from '@playwright/test'
import fs from 'node:fs'
const output = process.argv[2] || 'test-results'
fs.mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.DRAW_CHROMIUM_PATH, headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:5173/draw/', { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: '查看理想小屋模板' }).click()
  await page.screenshot({ path: `${output}/template.png`, animations: 'disabled' })
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: '查看理想小屋模板' }).click()
  await page.screenshot({ path: `${output}/mobile-template.png`, fullPage: true, animations: 'disabled' })
  console.log(JSON.stringify({ errors }))
} finally { await browser.close() }
