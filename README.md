# ribbon

Configurable status line for [Claude Code](https://claude.com/claude-code). Claude Code pipes a
JSON payload (model, workspace, context usage, rate limits, session cost) to a command on every
render; ribbon prints ANSI-colored rows of segments built from it. Which segments appear, and in
what order, is set in a small JSON file.

Needs Node 24 or newer.

## Install

```
npm i -g @bithyte/ribbon
ribbon install
```

`ribbon install` points `statusLine` in `${CLAUDE_CONFIG_DIR:-~/.claude}/settings.json` at
`ribbon render` (with a 30 second `refreshInterval`) and creates `ribbon.json` with the default
layout if it's missing. If a different `statusLine` is already set it asks before replacing it;
`-y` / `--yes` skips the question.

```
ribbon uninstall
```

removes `statusLine` only while it runs ribbon. `ribbon.json` is left alone.

## Layout

The layout lives at `${CLAUDE_CONFIG_DIR:-~/.claude}/ribbon.json`. `rows` is a list of rows, each
row is a list of segments, and each row prints as one line. Segments that have nothing to show
(no git repo, no rate limits, ...) drop out silently. This is the default, used when the file is
missing:

```json
{
  "rows": [
    [{ "type": "title" }, { "type": "git" }],
    [
      { "type": "emotion" },
      { "type": "model" },
      { "type": "effort" },
      { "type": "context" },
      { "type": "fiveHour" },
      { "type": "sevenDay" },
      { "type": "cost" }
    ]
  ]
}
```

An invalid file is reported as an error rather than silently ignored. Add a row with `email` or a
`run` segment like this:

```json
{
  "rows": [
    [{ "type": "title" }, { "type": "git" }],
    [{ "type": "model" }, { "type": "cost" }],
    [{ "type": "email" }, { "type": "run", "command": "kubectl config current-context" }]
  ]
}
```

## Segments

- `title`: repo name, or the last part of the current directory.
- `git`: branch with a dirty/clean marker and staged, modified and untracked counts.
- `emotion`: Claude's inferred emotional state, read from the `emotion-statusline` plugin's cache
  in `<config dir>/cache` when it's fresh (10 minutes). `desperate` renders as bold red
  `DESPERATE`. Nothing if no cache.
- `model`: model name, colored by family.
- `effort`: reasoning effort level.
- `context`: context tokens used.
- `fiveHour`: 5-hour usage bar with a reset countdown and a pace tick, colored by pace.
- `sevenDay`: compact 7-day usage gauge with a reset countdown, expanding to a full bar when usage
  runs well over pace.
- `cost`: session cost in USD.
- `email`: logged-in account email, from `<config dir>/.claude.json`.
- `run`: output of a shell command (see below).

## Run segments

`{ "type": "run", "command": "..." }` runs the command with `/bin/sh -c`.

- The Claude Code payload is passed on its stdin.
- Only the first line of stdout is used (trailing whitespace trimmed, cut at 64 KiB).
- It gets 500ms; after that the process group is killed.
- It runs with `RIBBON_RENDER=1` set. A `ribbon render` that sees it skips its own run
  segments, so a run segment that calls ribbon can't recurse.
- Empty output, a non-zero exit, a timeout or a failure to spawn all drop the segment silently.

## Development

```
npm test
npm run typecheck
npx prettier --check .
npm run build
```

Tests run `.ts` directly with `node:test`; there's no build step except for publishing
(`prepack` runs `npm run build` into `dist/`).

## License

MIT
