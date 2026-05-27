import fs from 'node:fs/promises'
import path from 'node:path'

const OPENAPI_URL = 'https://api.wassenger.com/v1/docs.json'
const TIMEOUT_MS = 15_000

export async function refreshApiSurface (apiKey, skillsDir) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(OPENAPI_URL, {
      headers: { Token: apiKey, Accept: 'application/json' },
      signal: controller.signal
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const spec = await res.json()

    const md = renderApiSurface(spec)
    const target = path.join(skillsDir, 'wassenger-mcp', 'references', 'api-surface.md')
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, md)
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`OpenAPI fetch timed out after ${TIMEOUT_MS}ms`)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function renderApiSurface (spec) {
  const groups = {}

  for (const [endpoint, methods] of Object.entries(spec.paths ?? {})) {
    for (const [verb, op] of Object.entries(methods)) {
      if (!op || typeof op !== 'object') continue
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(verb)) continue
      const tag = (op.tags?.[0] ?? 'other').toLowerCase()
      groups[tag] = groups[tag] ?? []
      groups[tag].push({
        method: verb.toUpperCase(),
        path: endpoint,
        summary: (op.summary ?? op.description ?? '').replace(/\s*\n\s*/g, ' ').slice(0, 120),
        operationId: op.operationId ?? ''
      })
    }
  }

  const date = new Date().toISOString().slice(0, 10)
  const lines = [
    '# Wassenger API Surface',
    '',
    `> Generated from ${OPENAPI_URL} on ${date}.`,
    `> Re-run \`npx @wassengerhq/skills update\` to refresh.`,
    '',
    `Tags found: ${Object.keys(groups).length}. Endpoints: ${Object.values(groups).flat().length}.`,
    '',
    'This file is auto-generated. The hand-curated mapping of endpoints to MCP tools lives in [tools-reference.md](tools-reference.md). When the two disagree, the MCP repo is the source of truth.',
    ''
  ]

  for (const tag of Object.keys(groups).sort()) {
    const ops = groups[tag].sort((a, b) => a.path.localeCompare(b.path))
    lines.push(`## ${tag}`, '')
    lines.push('| Method | Path | Summary |')
    lines.push('|---|---|---|')
    for (const op of ops) {
      lines.push(`| \`${op.method}\` | \`${op.path}\` | ${op.summary || '—'} |`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
