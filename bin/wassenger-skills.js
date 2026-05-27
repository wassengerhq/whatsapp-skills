#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { init, install, doctor, list, update } from '../src/installer.js'

const args = process.argv.slice(2)
const command = args[0] ?? 'init'

const commands = {
  init: () => init({ interactive: true }),
  install: () => install({ agent: args[1] ?? 'auto' }),
  doctor: () => doctor(),
  list: () => list(),
  update: () => update(),
  help: () => help(),
  '--help': () => help(),
  '-h': () => help(),
  '--version': () => version(),
  '-v': () => version()
}

function help () {
  console.log(`
wassenger-skills — Agent Skills for Wassenger
Documentation: https://github.com/wassengerhq/wassenger-skills

Usage:
  npx @wassengerhq/skills [command] [options]

Commands:
  init               Onboard end-to-end: validate API key, install skills,
                     register the Wassenger MCP server in the detected
                     agent's config. This is the default.
  install [agent]    Just copy the SKILL.md files into the agent's skills
                     directory. Pass an agent name (claude-code, cursor,
                     codex, goose) or "auto" to detect.
  doctor             Health-check the install: API key, connectivity,
                     installed skills, MCP wiring.
  list               List skills bundled in this version.
  update             Re-copy skills from the bundle (use after upgrading
                     the npm package).
  help               Show this message.

Environment:
  WASSENGER_API_KEY  Your Wassenger API key. If unset, "init" will prompt.

Examples:
  npx @wassengerhq/skills                       # interactive setup
  npx @wassengerhq/skills install claude-code   # just copy skills to ~/.claude/skills
  npx @wassengerhq/skills doctor                # check everything is wired
`)
}

async function version () {
  const pkgPath = new URL('../package.json', import.meta.url)
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
  console.log(pkg.version)
}

const handler = commands[command]
if (!handler) {
  console.error(`Unknown command: ${command}`)
  help()
  process.exit(1)
}

Promise.resolve(handler()).catch(err => {
  console.error('\n❌', err.message ?? err)
  if (process.env.DEBUG) console.error(err.stack)
  process.exit(1)
})
