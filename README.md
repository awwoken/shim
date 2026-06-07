# shim

## Description

`shim` installs CLI tools into isolated, managed environments and exposes them through small executable shims.

The goal is to make global command-line tools predictable:

- each tool gets its own isolated package prefix
- runtimes are provisioned and tracked explicitly
- generated shims live in one user-controlled bin directory
- installed tools and executable names are recorded in a registry
- package providers and runtimes can be extended over time

The current built-in provider is `npm`, backed by a managed `node` runtime. The compiled CLI is self-contained; managed runtimes for installed tools are downloaded into `SHIM_HOME`.

## Install

> TODO: publish a Homebrew formula. There is no tap available yet.

Planned Homebrew install command:

```sh
brew install awwoken/tap/shim
```

For now, build from source with `bun run build` and use `build/shim`.

By default, generated shims are written to:

```txt
~/.shim/bin
```

Add that directory to your shell `PATH`:

```sh
export PATH="$HOME/.shim/bin:$PATH"
```

Run `shim doctor` to verify the installation and check whether any earlier `PATH` entries shadow installed shims.

## Usage

### Install a tool

```sh
shim install prettier
```

Bare package specs use the default provider, currently `npm`.

Provider-qualified specs are also supported:

```sh
shim install npm:prettier
shim install npm:prettier@3.8.3
```

Use a specific runtime version, major, or `lts`:

```sh
shim install prettier --runtime 24
shim install prettier --runtime 24.16.0
shim install prettier --runtime lts
```

Replace existing shims when needed:

```sh
shim install prettier --force
```

Disable package lifecycle scripts:

```sh
shim install prettier --ignore-scripts
```

### List installed tools

```sh
shim list
```

Example:

```txt
Package   Version  Runtime       Bins
prettier  3.8.3    node 24.16.0  prettier
```

### Locate a shim

```sh
shim which prettier
```

This prints only the shim path, so it can be used in scripts.

### Remove a tool

```sh
shim remove prettier
shim remove npm:prettier
```

### Upgrade tools

Upgrade all tools for the default provider:

```sh
shim upgrade
```

Upgrade one package or executable:

```sh
shim upgrade prettier
shim upgrade npm:prettier
```

### Check installation health

```sh
shim doctor
```

Doctor checks:

- required `SHIM_HOME` directories
- whether the shim bin directory is in `PATH`
- whether earlier `PATH` entries shadow installed shims
- tool metadata
- managed runtime files
- provider-specific package prefixes
- generated shim files and executable bits

Warnings and errors include hints when there is an obvious next step.

### Provider specs

A package spec can optionally start with a provider prefix:

```txt
provider:spec
```

Examples:

```txt
npm:prettier
npm:@scope/package
npm:typescript@latest
```

Bare specs are interpreted by the default provider. Unknown provider prefixes fail early with a clear error.

### Configuration

`shim` reads configuration from:

```txt
~/.shim/config.json
```

Set `SHIM_HOME` to use a different home directory:

```sh
SHIM_HOME=/tmp/shim-test shim install prettier
```

Current config shape:

```json
{
  "providers": {
    "npm": {
      "registry": "https://registry.npmjs.org"
    }
  },
  "runtimes": {
    "node": {
      "defaultPolicy": "latest-lts",
      "bootstrapVersion": "24.16.0",
      "mirror": "https://nodejs.org/dist"
    }
  }
}
```

All fields are optional. Defaults are used when the config file or a nested field is missing.

Legacy top-level config fields are currently accepted for compatibility:

```json
{
  "registry": "https://registry.npmjs.org",
  "nodeMirror": "https://nodejs.org/dist",
  "bootstrapNode": "24.16.0",
  "defaultNodePolicy": "latest-lts"
}
```

### Filesystem layout

Inside `SHIM_HOME`:

```txt
bin/              generated executable shims
cache/            downloaded runtime archives
locks/            mutation lock directories
registry.json     installed tool and executable registry
runtimes/         managed runtimes
tmp/              staging directories
tools/            provider-specific installed tool prefixes
```

For npm tools, installed packages live under:

```txt
tools/npm/<package>/<version>/
```

Generated shims live under:

```txt
bin/<executable>
```

## Development

Development requirements:

- Bun 1.4 canary or newer compatible with the project scripts
- macOS or Linux platform supported by the Node runtime downloader
- `tar` available on `PATH` for runtime archive extraction

Install dependencies:

```sh
bun install
```

Run the TypeScript entrypoint directly:

```sh
bun run dev -- <command>
```

Examples:

```sh
bun run dev -- install prettier
bun run dev -- list
```

Build the self-contained CLI:

```sh
bun run build
```

The compiled executable is written to:

```txt
build/shim
```

Common development commands:

```sh
bun run fmt
bun run fmt:check
bun run lint
bun run typecheck
bun run build
bun test
```

Before finishing code changes, run:

```sh
bun run fmt:check
bun run lint
bun run typecheck
bun run build
```

For install/remove/shim behavior changes, also run a smoke test with a temporary `SHIM_HOME`.

### Architecture

```txt
src/
  cli/              command wiring and terminal output
  core/             shared product concepts and registry logic
  providers/        package ecosystem integrations
  runtimes/         runtime provisioning and runtime-specific behavior
  support/          generic filesystem/process/path helpers
  index.ts          executable entrypoint
```

The CLI selects a provider, providers translate package-manager behavior into core concepts, and runtimes own runtime-specific provisioning and shim behavior.

Keep provider-specific logic in `providers/<provider>/` and runtime-specific logic in `runtimes/<runtime>/`.

## License

MIT
