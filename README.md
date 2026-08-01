# shim

`shim` installs CLI tools into isolated, managed environments and exposes them through executable shims.

The built-in provider is currently `npm`, backed by a managed `node` runtime.

## Why

Global npm tools usually run with whichever `node` is currently selected in your shell. If `prettier` was installed for Node 22 but your shell now points at Node 24, running `prettier` depends on today's shell state instead of the runtime it was installed for.

`shim` installs npm tools into managed prefixes, records the selected Node runtime, and exposes deterministic wrappers from `~/.shim/bin`. This makes global tools predictable while still supporting npm compatibility features such as `--expose` when one managed tool needs to resolve another managed package.

## Install

```sh
brew install awwoken/tap/shim
```

Add the shim bin directory to `PATH`:

```sh
export PATH="$HOME/.shim/bin:$PATH"
```

## Usage

Install a tool:

```sh
shim install prettier
shim install npm:prettier@3.8.3
```

List installed tools:

```sh
shim list
```

Find a shim path:

```sh
shim which prettier
```

Remove a tool:

```sh
shim remove prettier
```

Upgrade tools:

```sh
shim upgrade
shim upgrade prettier
```

Preview and remove orphaned managed runtimes:

```sh
shim prune --dry-run
shim prune --yes
```

Check installation health:

```sh
shim doctor
```

`doctor` validates the shim home, registry state, runtime/provider files, PATH shadowing, and generated shim file contents.

Repair generated shim files from registry metadata:

```sh
shim repair
```

Useful install options:

```sh
shim install prettier --runtime 24
shim install prettier --force
shim install prettier --ignore-scripts
shim install typescript --expose
```

Use `--expose` when an npm package should be resolvable by other managed Node tools at runtime. Exposed packages are linked into shim's managed npm module namespace, and generated Node shims include that namespace in `NODE_PATH`.

For example, to let `typescript-language-server` discover the managed `typescript` package automatically:

```sh
shim install typescript --expose
shim install typescript-language-server
```

## Configuration

`shim` reads config from:

```txt
~/.shim/config.json
```

Use `SHIM_HOME` to override the home directory:

```sh
SHIM_HOME=/tmp/shim-test shim install prettier
```

Example config:

```json
{
  "providers": {
    "npm": {
      "registry": "https://registry.npmjs.org"
    }
  },
  "runtimes": {
    "node": {
      "bootstrapVersion": "24.16.0",
      "mirror": "https://nodejs.org/dist"
    }
  }
}
```

## Development

Run from source:

```sh
bun run dev -- <command>
```

Build a local development binary:

```sh
bun install
bun run build
build/shim <command>
```

Common checks:

```sh
bun run fmt:check
bun run lint
bun run typecheck
bun run build
bun test
```

## Release

Releases use a release PR followed by a version tag.

To prepare a release, open a PR that bumps `package.json`. Review and merge that PR normally.

After the release PR is merged, tag the merged `main` commit and push the tag:

```sh
git checkout main
git pull
git tag vX.Y.Z
git push origin vX.Y.Z
```

The `Release` workflow runs from pushed `v*` tags. It verifies the tag matches `package.json`, runs checks, creates or updates the GitHub release, and updates `awwoken/homebrew-tap` with the new formula checksums.

Required repository secret:

- `HOMEBREW_TAP_TOKEN` — token that can push to `awwoken/homebrew-tap`.

Optional repository secret:

- `RELEASE_TOKEN` — token used instead of `GITHUB_TOKEN` for creating or updating GitHub releases.

## License

MIT
