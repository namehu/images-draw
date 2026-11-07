import fs from 'node:fs'
import { chromium } from '@playwright/test'
const raw = fs.readFileSync(process.argv[2], 'utf8')
const key = raw.match(/^DRAW_TEST_API_KEY\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '')
if (!key) throw new Error('Test key is missing')
const output = process.argv[3] || 'test-results/live'
fs.mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.DRAW_CHROMIUM_PATH, headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
  page.setDefaultTimeout(30_000)
  await page.goto('http://127.0.0.1:5173/draw/')
  await page.getByRole('button', { name: '连接 API', exact: true }).click()
  await page.getByLabel('API Key', { exact: true }).fill(key)
  await page.getByRole('button', { name: '连接并验证' }).click()
  await page.getByRole('button', { name: '开始创作' }).click()
  console.log('Connected. Starting one real generation.')
  await page.locator('#prompt').fill('极简静物摄影：一颗新鲜的黄色柠檬放在浅奶油色桌面上，柔和自然光和清晰投影，留白充足，无文字，方形构图。')
  await page.getByRole('button', { name: '生成图像', exact: true }).click()
  const result = await waitResult(page)
  if (!result.ok) { console.log(JSON.stringify({ phase: 'generation', ...result })); process.exitCode = 1 }
  else {
    await page.screenshot({ path: `${output}/generation.png` })
    const firstDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载原图', exact: true }).last().click()
    await (await firstDownload).saveAs(`${output}/generated.png`)
    console.log('Generation and download succeeded. Starting one reference edit.')
    await page.getByRole('button', { name: '以此为参考继续创作' }).click()
    await page.locator('#prompt').fill('保留这颗柠檬和构图，将桌面与背景改为柔和的淡粉色，维持自然光与真实投影，不要添加文字。')
    await page.getByRole('button', { name: '生成图像', exact: true }).click()
    const edited = await waitResult(page)
    console.log(JSON.stringify({ phase: 'edit', ...edited }))
    if (edited.ok) {
      await page.screenshot({ path: `${output}/edit.png` })
      const secondDownload = page.waitForEvent('download')
      await page.getByRole('button', { name: '下载原图', exact: true }).last().click()
      await (await secondDownload).saveAs(`${output}/edited.png`)
    } else process.exitCode = 1
  }
} catch (error) { console.error(String(error.message).split(key).join('[redacted]').replace(/sk-[\w-]+/g, '[redacted]')); process.exitCode = 1 }
finally { await browser.close() }

async function waitResult(page) {
  const start = Date.now()
  while (Date.now() - start < 720_000) {
    if (await page.getByRole('dialog', { name: '查看作品' }).count()) return { ok: true, seconds: Math.round((Date.now() - start) / 1000) }
    if (await page.getByRole('alert').count()) return { ok: false, error: (await page.getByRole('alert').innerText()).split(key).join('[redacted]') }
    await page.waitForTimeout(1000)
  }
  return { ok: false, error: 'Timed out after 12 minutes; no automatic retry.' }
}
