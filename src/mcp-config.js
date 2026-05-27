import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const HOME = os.homedir()

const AGENTS = [
  {
    name: 'claude-code',
    label: 'Claude Code',
    skillsDir: path.join(HOME, '.claude', 'skills'),
    configFile: path.join(HOME, '.claude', 'settings.json'),
    detectPaths: [path.join(HOME, '.claude')],
    format: 'json',
    mcpKey: 'mcpServers'
  },
  {
    name: 'cursor',
    label: 'Cursor',
    skillsDir: path.join(HOME, '.cursor', 'skills'),
    configFile: path.join(HOME, '.cursor', 'mcp.json'),
    detectPaths: [path.join(HOME, '.cursor')],
    format: 'json',
    mcpKey: 'mcpServers'
  },
  {
    name: 'codex',
    label: 'Codex CLI',
    skillsDir: path.join(HOME, '.codex', 'skills'),
    configFile: path.join(HOME, '.codex', 'config.toml'),
    detectPaths: [path.join(HOME, '.codex')],
    format: 'toml'
  },
  {
    name: 'goose',
    label: 'Goose',
    skillsDir: path.join(HOME, '.config', 'goose', 'skills'),
    configFile: path.join(HOME, '.config', 'goose', 'config.yaml'),
    detectPaths: [path.join(HOME, '.config', 'goose')],
    format: 'yaml'
  }
]

export async function detectAgents () {
  const detected = []
  for (const agent of AGENTS) {
    for (const probe of agent.detectPaths) {
      try {
        await fs.access(probe)
        detected.push({ ...agent, path: probe })
        break
      } catch {}
    }
  }
  return detected
}

export async function writeMcpConfig (agent, apiKey) {
  switch (agent.format) {
    case 'json': return writeJsonMcp(agent, apiKey)
    case 'toml': return writeTomlMcp(agent, apiKey)
    case 'yaml': return writeYamlMcp(agent, apiKey)
    default: throw new Error(`Unsupported config format: ${agent.format}`)
  }
}

async function writeJsonMcp (agent, apiKey) {
  let config = {}
  try {
    const raw = await fs.readFile(agent.configFile, 'utf8')
    config = raw.trim() ? JSON.parse(raw) : {}
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }

  config[agent.mcpKey] = config[agent.mcpKey] ?? {}
  config[agent.mcpKey].wassenger = {
    command: 'npx',
    args: ['-y', '@wassengerhq/mcp-wassenger'],
    env: { WASSENGER_API_KEY: apiKey }
  }

  await fs.mkdir(path.dirname(agent.configFile), { recursive: true })
  await fs.writeFile(agent.configFile, JSON.stringify(config, null, 2) + '\n')
}

async function writeTomlMcp (agent, apiKey) {
  let existing = ''
  try { existing = await fs.readFile(agent.configFile, 'utf8') } catch {}

  const safeKey = apiKey.replace(/"/g, '\\"')
  const block = `[mcp_servers.wassenger]
command = "npx"
args = ["-y", "@wassengerhq/mcp-wassenger"]
env = { WASSENGER_API_KEY = "${safeKey}" }`

  const re = /\[mcp_servers\.wassenger\][\s\S]*?(?=\n\[|\n*$)/m
  const next = re.test(existing)
    ? existing.replace(re, block)
    : (existing.trimEnd() ? existing.trimEnd() + '\n\n' : '') + block + '\n'

  await fs.mkdir(path.dirname(agent.configFile), { recursive: true })
  await fs.writeFile(agent.configFile, next)
}

async function writeYamlMcp (agent, apiKey) {
  let existing = ''
  try { existing = await fs.readFile(agent.configFile, 'utf8') } catch {}

  if (/^\s*wassenger:/m.test(existing)) {
    process.stderr.write('  (existing "wassenger" entry in YAML config — left untouched to avoid corruption; edit manually.)\n')
    return
  }

  const safeKey = apiKey.replace(/"/g, '\\"')
  const block = `extensions:
  wassenger:
    command: npx
    args: ["-y", "@wassengerhq/mcp-wassenger"]
    env:
      WASSENGER_API_KEY: "${safeKey}"
`

  await fs.mkdir(path.dirname(agent.configFile), { recursive: true })
  const next = existing.includes('extensions:')
    ? existing.replace(/^extensions:\s*$/m, block.trimEnd())
    : (existing.trimEnd() ? existing.trimEnd() + '\n\n' : '') + block

  await fs.writeFile(agent.configFile, next)
}

export const SUPPORTED_AGENTS = AGENTS.map(a => a.name)
