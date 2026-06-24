# Contributing to Wassenger Skills

Thanks for helping improve the pack. These skills teach AI agents how to drive WhatsApp Business through Wassenger, so the bar is **correctness**: a recipe that an agent follows must map to real [`mcp-wassenger`](https://github.com/wassengerhq/mcp-wassenger) tools and the real [Wassenger API](https://app.wassenger.com/docs).

## Repo layout

```
skills/<name>/SKILL.md     # one skill = one folder with a SKILL.md
skills/<name>/references/  # optional deep-dive docs loaded on demand
bin/, src/                 # the install CLI (npx @wassengerhq/skills)
.claude-plugin/            # plugin + marketplace manifests
```

## Adding or editing a skill

1. **Frontmatter.** Every `SKILL.md` needs `name` (must match the folder) and a concrete `description` that says *when* the skill triggers and *what* it does — that's what an agent matches against, so be specific.
2. **Use real tools.** Reference only tools and parameters that exist in [`skills/wassenger-mcp/references/tools-reference.md`](skills/wassenger-mcp/references/tools-reference.md) — it's the source of truth for tool names and shapes. If you're unsure, check the live MCP server or the API docs. Don't invent tools or parameters.
3. **WABA only.** This pack targets the official WhatsApp Business API. Don't document QR-paired-only features (groups, channels, WhatsApp Status, live messages).
4. **Respect WhatsApp rules.** Free-form messages only inside the 24-hour customer-service window (which opens on a customer's inbound message); pre-approved templates outside it. Marketing needs opt-in.
5. **Keep the house style.** Match the structure of sibling skills: *When to use → Prerequisites → Recipes → Anti-patterns → See also*.
6. **Register it.** Add new skills to `.claude-plugin/plugin.json` (and the README table) so they ship with the pack.

## Validate before you open a PR

```bash
npm install
npm run validate     # checks every skill's frontmatter and structure
```

For CLI changes, sanity-check the install flow:

```bash
node bin/wassenger-skills.js doctor
```

## Pull requests

- One logical change per PR; describe what an agent can now do (or do correctly) that it couldn't before.
- Note any tool/parameter you verified against the live MCP or API docs.
- By contributing you agree your work is licensed under the repo's [MIT License](LICENSE).

Questions? Open an issue or reach us at support@wassenger.com.
