import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'
const raw = fs.readFileSync(process.argv[2], 'utf8')
const key = raw.match(/^DRAW_TEST_API_KEY\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '')
if (!key) throw new Error('Test key is missing')
const browser = await chromium.launch({ executablePath: process.env.DRAW_CHROMIUM_PATH, headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
  let calls = 0, completed = false
  const output = path.dirname(path.resolve(process.argv[3]))
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/v1/images/edits') {
      calls++
    }
  })
  page.on('response', response => { if (response.url().includes('/v1/images/edits')) console.log(JSON.stringify({status:response.status(),contentType:response.headers()['content-type']})) })
  await page.goto(process.argv[4] || 'http://127.0.0.1:5173/draw/')
  await page.getByRole('button', { name: '连接 API', exact: true }).click()
  await page.getByLabel('API Key', { exact: true }).fill(key)
  await page.getByRole('button', { name: '连接并验证' }).click()
  await page.getByRole('button', { name: '开始创作' }).click()
  await page.getByLabel('选择参考图文件').setInputFiles(process.argv[3])
  await page.locator('.reference-strip').waitFor()
  await page.locator('#prompt').fill('保持这颗柠檬不变，将背景改为浅粉色。')
  await page.getByRole('button', { name: '生成图像', exact: true }).click()
  console.log('Started one real reference edit; no automatic retry.')
  const start = Date.now()
  while (Date.now() - start < 720_000) {
    if (await page.getByRole('dialog', { name: '查看作品' }).count()) {
      await page.screenshot({ path: path.join(output, 'edit.png'), animations: 'disabled' })
      const download = page.waitForEvent('download')
      await page.getByRole('button', { name: '下载原图', exact: true }).last().click()
      await (await download).saveAs(path.join(output, 'edited.png'))
      const seconds = Math.round((Date.now()-start)/1000)
      await page.reload()
      await page.getByRole('tab', { name: /我的作品/ }).click()
      await page.getByRole('button', { name: /查看作品：保持这颗柠檬不变/ }).waitFor()
      completed = true
      if (calls !== 1) throw new Error('Unexpected repeated request')
      console.log(JSON.stringify({ok:true,seconds,calls,downloaded:true,historyAfterReload:true})); break
    }
    if (await page.getByRole('alert').count()) { console.log(JSON.stringify({ok:false,error:(await page.getByRole('alert').innerText()).split(key).join('[redacted]')})); process.exitCode=1; break }
    await page.waitForTimeout(1000)
  }
  if (!completed && !process.exitCode) throw new Error('Timed out waiting for the edited image')
} catch(error) { console.error(String(error.message).split(key).join('[redacted]')); process.exitCode=1 }
finally { await browser.close() }
