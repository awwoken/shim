# shim

`shim` installs CLI tools into isolated, managed environments and exposes them through executable shims.

The built-in provider is currently `npm`, backed by a managed `node` runtime.

## Install

```sh
brew install awwoken/tap/shim
```

For now, build from source:

```sh
bun install
bun run build
```

Then use:

```txt
build/shim
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

Check installation health:

```sh
shim doctor
```

Useful install options:

```sh
shim install prettier --runtime 24
shim install prettier --force
shim install prettier --ignore-scripts
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

The `Release` workflow runs from pushed `v*` tags. It verifies the tag matches `package.json`, runs checks, builds macOS and Linux release archives, creates or updates the GitHub release, and updates `awwoken/homebrew-tap` with the new formula checksums. It can also be run manually with a tag for release recovery.

Required repository secret:

- `HOMEBREW_TAP_TOKEN` — token that can push to `awwoken/homebrew-tap`.

Optional repository secret:

- `RELEASE_TOKEN` — token used instead of `GITHUB_TOKEN` for creating or updating GitHub releases.

## License

MIT
