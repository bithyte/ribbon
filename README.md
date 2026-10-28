# ribbon

Configurable status line for [Claude Code](https://claude.com/claude-code). Usage docs are in
[apps/ribbon/README.md](apps/ribbon/README.md); this is the repo around it.

## Layout

- `apps/ribbon`: the `ribbon` CLI, published as `@bithyte/ribbon`. Built with `vp pack` into a
  single `dist/cli.mjs` that bundles the packages below.
- `packages/layout`: `ribbon.json` parsing, validation and the default layout.
- `packages/render`: payload parsing and the ANSI segment renderer.
- `packages/sources`: git, emotion cache, email and `run` segment inputs gathered for a render.
- `packages/install`: wiring ribbon in and out of Claude Code's `settings.json`.

The `@ribbon/*` packages are private. They export their `.ts` sources directly, so tests and the
CLI run without building them first.

## Development

Needs Node 24 or newer and pnpm (the version is pinned in `packageManager`). Tooling is
[Vite+](https://viteplus.dev): `vp check` formats, lints and type checks; `vp test` runs Vitest.

```
pnpm install
pnpm check
pnpm test
pnpm build
```

`pnpm ready` runs all three.

## Releasing

Add a changeset for any change that should ship, including changes to the `@ribbon/*` packages,
since they only reach users through `@bithyte/ribbon`:

```
pnpm changeset
```

On every push to `main`, `.github/workflows/publish.yml` picks a mode. With changesets pending it
opens or updates a "version packages" PR. Once that PR is merged, it runs `pnpm ready`, packs
`@bithyte/ribbon` and publishes it to npm with
[trusted publishing](https://docs.npmjs.com/trusted-publishers), then tags a GitHub release. No
npm token is stored anywhere; the publish job gets a short-lived OIDC token instead.

npm needs a trusted publisher on `@bithyte/ribbon` pointing at this repo, workflow `publish.yml`
and environment `npm`.

## License

MIT
