import fs from 'node:fs'
const raw = fs.readFileSync(process.argv[2], 'utf8')
const key = raw.match(/^DRAW_TEST_API_KEY\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '')
if (!key) throw new Error('Test key is missing')
const response = await fetch('https://sub.velunest.top/v1/models', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30_000), redirect: 'error' })
const body = await response.json()
console.log(JSON.stringify({status:response.status, imageModels:body.data?.map(m=>m.id).filter(m=>/^gpt-image-/i.test(m)), errorType:body.error?.type}))
