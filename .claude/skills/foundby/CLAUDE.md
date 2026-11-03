# foundby

A Claude Code skill plus Python scripts that keep a ledger of every distinct way people
find a website (referring hosts, AI assistants, link unfurlers, in-app browsers, GA
sources, backlinks and web mentions) and report only what is new since the last run.
The deliverable is the skill; state lives in the user's repo as `docs/foundby.md` and
`.json`. There is no hosted service and there will not be one.

## Rules

- Python 3.10+ standard library only, plus `cryptography` for the GA service-account JWT.
  No pip packages beyond that; users copy this directory into `.claude/skills/foundby`.
- Every source degrades alone and says so in the report's `sources:` line. A missing
  credential is "not configured", never a crash.
- Nothing site-specific in this repo: no domains, property ids, buckets or owner names
  outside `foundby.json` examples. The reference deployment (vizz.fm) is private.
- Counts are magnitudes: edge hits plus GA sessions overlap. Never call a hits column
  sessions or visitors in docs or reports.
- Client IPs are never read from logs. Only aggregate counts are written.
- The report block is column-aligned plain text, pasted verbatim by the agent. Keep it
  stable; agents and people read it.
- `SKILL.md` is for the agent, `README.md` for the person, `docs/sources.md` for
  per-source setup and limits. A measurement fact lives in `docs/sources.md`, once.
- No em dashes in prose, docs, comments or commit messages. No AI co-author or session
  trailers. Commit only when asked.
- Use absolute paths in shell commands; never rely on `cd` carrying across calls.

## Layout

- `SKILL.md`: the agent-facing skill (install this directory as the skill).
- `scripts/foundby.py`: the CLI (`init`, `doctor`, `run`, `set`, `mention`, `render`, `view`,
  `update`, `version`).
- `VERSION`: the release number, read by the CLI and fetched raw from GitHub by
  `update --check`. Bump it in every release commit that changes `scripts/` or `SKILL.md`;
  users only hear about a change if the number moves. `SCHEMA` in `ledger.py` is the
  ledger JSON shape: bump it only when a field changes meaning, and migrate in `_load`.
- `scripts/ledger.py`: folding, classification, merge, markdown render.
- `scripts/edge.py`, `ga.py`, `mentions.py`, `bing.py`: one source each, one JSON each.
- `scripts/config.py`: `foundby.json` lookup and defaults.
- `scripts/view.html`: the single-file ledger viewer; `__DATA__` is replaced at view time.
- `docs/sources.md`: setup, cost and blind spots of every source.
- `site/`: foundby.dev, a static page in `site/public/` (no build step), `main.tf` for
  S3 + CloudFront + Route 53 + logging v2, `deploy.sh`, and `og.html` + `og-refresh.sh` for
  the OG card. Launch steps are in `~/Sites/docs/launch-playbook.md`. The page's call to
  action is the prompt, not a button.

## Site

`site/deploy.sh` syncs `site/public/` to S3 and invalidates CloudFront; config in
`site/.env.deploy` (gitignored, see `.env.example`). Keep `index.html` and `llms.txt` in step
with `README.md`: same prompt, same claims, shipped features only.

## Testing

Point `FOUNDBY_CONFIG` at a config whose `ledger` is in a scratch directory, copy a real
ledger there, and run `foundby.py run <outdir> --skip mentions`. Compare row counts
before and after; a first run against a seeded ledger should report few or no NEW rows.
