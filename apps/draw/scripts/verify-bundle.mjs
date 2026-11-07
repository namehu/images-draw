import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve(process.argv[2] || '.')
const secretFile = process.argv[3]
const key = secretFile ? fs.readFileSync(secretFile, 'utf8').match(/^DRAW_TEST_API_KEY\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '') : undefined
const forbidden = []
let count = 0
function walk(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name)
    if (entry.isDirectory()) walk(file)
    else {
      count++
      if (/^\.env|\.map$/.test(entry.name) || (key && fs.readFileSync(file).includes(Buffer.from(key)))) forbidden.push(path.relative(root, file))
    }
  }
}
walk(root)
console.log(JSON.stringify({ files: count, unexpectedSecretsOrSourceMaps: forbidden }))
if (forbidden.length) process.exitCode = 1
