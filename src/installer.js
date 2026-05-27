import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateApiKey } from './api-validate.js'
import { detectAgents, writeMcpConfig } from './mcp-config.js'
import { refreshApiSurface } from './auto-discover.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILLS_DIR = path.resolve(__dirname, '..', 'skills')

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', magenta: '\x1b[35m'
}
const s = (color, text) => process.stdout.isTTY ? `${C[color] ?? ''}${text}${C.reset}` : text

export async function init ({ interactive = true } = {}) {
  banner()

  let apiKey = process.env.WASSENGER_API_KEY
  if (!apiKey && interactive) {
    console.log(`Get an API key at ${s('cyan', 'https://app.wassenger.com/developers/api-keys')}\n`)
    apiKey = await ask('Paste your Wassenger API key:')
  }
  if (!apiKey) {
    throw new Error('Missing API key. Set WASSENGER_API_KEY or run interactively.')
  }

  process.stdout.write('Validating API key... ')
  const account = await validateApiKey(apiKey)
  console.log(s('green', '✓'))
  console.log(`  Account: ${s('bold', account.email)} — ${account.devices} device(s) connected.\n`)

  const agents = await detectAgents()
  if (agents.length === 0) {
    console.log(s('yellow', '⚠  No supported agent detected.'))
    console.log('   Manual install: copy the skills/ directory into your agent\'s skills folder.')
    console.log('   See https://agentskills.io/clients for per-agent paths.\n')
    return
  }
  console.log(`Detected ${agents.length} agent(s):`)
  for (const a of agents) console.log(`  ${s('green', '✓')} ${a.label} ${s('dim', `(${a.path})`)}`)
  console.log()

  process.stdout.write('Installing skills... ')
  const installed = await copySkillsToAgents(agents)
  console.log(s('green', `✓ (${installed} skills × ${agents.length} agent(s))`))

  process.stdout.write('Registering Wassenger MCP server... ')
  for (const agent of agents) await writeMcpConfig(agent, apiKey)
  console.log(s('green', '✓'))

  process.stdout.write('Refreshing API surface (live OpenAPI)... ')
  try {
    await refreshApiSurface(apiKey, SKILLS_DIR)
    console.log(s('green', '✓'))
  } catch (e) {
    console.log(s('yellow', `skipped (${e.message})`))
  }

  console.log(`\n${s('green', '✓ Done.')} Restart your agent for the changes to take effect.`)
  console.log(`\nTry asking it: ${s('cyan', '"List the WhatsApp devices in my Wassenger account."')}\n`)
}

export async function install ({ agent = 'auto' } = {}) {
  const all = await detectAgents()
  const agents = agent === 'auto' ? all : all.filter(a => a.name === agent)
  if (agents.length === 0) {
    throw new Error(`No agent found${agent !== 'auto' ? `: ${agent}` : ''}. Supported: claude-code, cursor, codex, goose.`)
  }
  const count = await copySkillsToAgents(agents)
  console.log(s('green', `✓ Installed ${count} skills across ${agents.length} agent(s).`))
}

export async function doctor () {
  banner()
  console.log('Health check:\n')

  const apiKey = process.env.WASSENGER_API_KEY
  console.log(`  WASSENGER_API_KEY: ${apiKey ? s('green', '✓ set') : s('red', '✗ missing')}`)

  if (apiKey) {
    try {
      const acct = await validateApiKey(apiKey)
      console.log(`  API connectivity:  ${s('green', '✓')} ${s('dim', `(${acct.email}, ${acct.devices} devices)`)}`)
    } catch (e) {
      console.log(`  API connectivity:  ${s('red', '✗')} ${e.message}`)
    }
  }

  const agents = await detectAgents()
  console.log(`  Detected agents:   ${agents.length ? s('green', '✓ ' + agents.length) : s('yellow', '⚠ none')}`)
  for (const a of agents) {
    const n = await countInstalledSkills(a)
    const mcp = await isMcpRegistered(a)
    console.log(`    ${a.label.padEnd(13)} ${n} skills · MCP ${mcp ? s('green', '✓') : s('yellow', '⚠ not registered')}`)
  }
  console.log()
}

export async function list () {
  const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true })
  const skills = entries.filter(e => e.isDirectory()).map(e => e.name).sort()
  console.log(`${skills.length} skills bundled:\n`)
  for (const skill of skills) {
    const meta = await readSkillMeta(skill).catch(() => ({}))
    const cat = meta.category ? s('dim', `[${meta.category}]`) : ''
    console.log(`  • ${s('bold', skill)} ${cat}`)
  }
  console.log()
}

export async function update () {
  console.log('Re-installing skills from this package version.\n')
  await install({ agent: 'auto' })
}

async function copySkillsToAgents (agents) {
  const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true })
  const skillDirs = entries.filter(e => e.isDirectory()).map(e => e.name)

  for (const agent of agents) {
    await fs.mkdir(agent.skillsDir, { recursive: true })
    for (const skill of skillDirs) {
      await copyDir(path.join(SKILLS_DIR, skill), path.join(agent.skillsDir, skill))
    }
  }
  return skillDirs.length
}

async function copyDir (src, dest) {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) await copyDir(srcPath, destPath)
    else await fs.copyFile(srcPath, destPath)
  }
}

async function countInstalledSkills (agent) {
  try {
    const entries = await fs.readdir(agent.skillsDir, { withFileTypes: true })
    return entries.filter(e => e.isDirectory() && e.name.startsWith('wassenger-')).length
  } catch {
    return 0
  }
}

async function isMcpRegistered (agent) {
  try {
    const raw = await fs.readFile(agent.configFile, 'utf8')
    return raw.includes('wassenger')
  } catch {
    return false
  }
}

async function readSkillMeta (skill) {
  const raw = await fs.readFile(path.join(SKILLS_DIR, skill, 'SKILL.md'), 'utf8')
  const fm = raw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''
  const meta = {}
  for (const line of fm.split('\n')) {
    const m = line.match(/^\s+(\w+):\s*(.+?)$/)
    if (m) meta[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return meta
}

async function ask (question) {
  const rl = createInterface({ input: stdin, output: stdout })
  const answer = (await rl.question(`${question} `)).trim()
  rl.close()
  return answer
}

function banner () {
  console.log(`
${s('bold', '┌───────────────────────────────────────────┐')}
${s('bold', '│')}  ${s('magenta', 'Wassenger Skills')} — WhatsApp + Agent SDK    ${s('bold', '│')}
${s('bold', '└───────────────────────────────────────────┘')}
`)
}
