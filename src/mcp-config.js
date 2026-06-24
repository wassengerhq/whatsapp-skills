import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const HOME = os.homedir()

const AGENTS = [
  {
    name: 'claude-code',
    label: 'Claude Code',
    skillsDir: path.join(HOME, '.claude', 'skills'),
    // Claude Code reads user-level MCP servers from ~/.claude.json (top-level
    // "mcpServers"), NOT from ~/.claude/settings.json (which holds settings/
    // permissions/hooks only).
    configFile: path.join(HOME, '.claude.json'),
    detectPaths: [path.join(HOME, '.claude'), path.join(HOME, '.claude.json')],
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

// Write to a sibling temp file then rename, so a crash mid-write can never
// truncate the user's live config.
async function writeFileAtomic (file, content) {
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, content)
  await fs.rename(tmp, file)
}

async function readConfigFile (file) {
  try {
    return await fs.readFile(file, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return ''
    throw err
  }
}

async function writeJsonMcp (agent, apiKey) {
  const raw = await readConfigFile(agent.configFile)
  let config = {}
  if (raw.trim()) {
    try {
      config = JSON.parse(raw)
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(`Could not parse ${agent.configFile} as JSON (it may be hand-edited or contain comments). Left it untouched — add the "wassenger" MCP server manually, or fix the JSON and re-run.`)
      }
      throw err
    }
  }

  config[agent.mcpKey] = config[agent.mcpKey] ?? {}
  config[agent.mcpKey].wassenger = {
    command: 'npx',
    args: ['-y', 'mcp-wassenger'],
    env: { WASSENGER_API_KEY: apiKey }
  }

  await fs.mkdir(path.dirname(agent.configFile), { recursive: true })
  await writeFileAtomic(agent.configFile, JSON.stringify(config, null, 2) + '\n')
}

async function writeTomlMcp (agent, apiKey) {
  const existing = await readConfigFile(agent.configFile)

  const safeKey = apiKey.replace(/"/g, '\\"')
  const block = `[mcp_servers.wassenger]
command = "npx"
args = ["-y", "mcp-wassenger"]
env = { WASSENGER_API_KEY = "${safeKey}" }`

  const re = /\[mcp_servers\.wassenger\][\s\S]*?(?=\n\[|\n*$)/m
  const next = re.test(existing)
    ? existing.replace(re, block)
    : (existing.trimEnd() ? existing.trimEnd() + '\n\n' : '') + block + '\n'

  await fs.mkdir(path.dirname(agent.configFile), { recursive: true })
  await writeFileAtomic(agent.configFile, next)
}

async function writeYamlMcp (agent, apiKey) {
  const existing = await readConfigFile(agent.configFile)

  if (/^\s*wassenger:/m.test(existing)) {
    process.stderr.write('  (existing "wassenger" extension in Goose config — left untouched to avoid corruption; edit manually.)\n')
    return
  }

  const safeKey = apiKey.replace(/"/g, '\\"')
  // The wassenger extension as a child of `extensions:` (2-space indent).
  const child = [
    '  wassenger:',
    '    command: npx',
    '    args: ["-y", "mcp-wassenger"]',
    '    env:',
    `      WASSENGER_API_KEY: "${safeKey}"`
  ].join('\n')

  let next
  const headerRe = /^extensions:[ \t]*$/m
  if (headerRe.test(existing)) {
    // Insert as a child under the existing block — keeps sibling extensions intact.
    next = existing.replace(headerRe, match => `${match}\n${child}`)
  } else if (/^extensions:/m.test(existing)) {
    // `extensions:` exists in an inline/flow form we can't safely splice.
    process.stderr.write('  (could not safely edit the existing "extensions:" block in Goose config — add the wassenger extension manually.)\n')
    return
  } else {
    next = (existing.trimEnd() ? existing.trimEnd() + '\n\n' : '') + 'extensions:\n' + child + '\n'
  }

  await fs.mkdir(path.dirname(agent.configFile), { recursive: true })
  await writeFileAtomic(agent.configFile, next)
}

export const SUPPORTED_AGENTS = AGENTS.map(a => a.name)
