# shim

`shim` installs CLI tools into isolated, managed environments and exposes them through executable shims.

The built-in provider is currently `npm`, backed by a managed `node` runtime.

## Install

> TODO: publish a Homebrew formula. There is no tap available yet.

Planned Homebrew command:

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

## License

MIT
