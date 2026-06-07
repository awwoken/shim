# Agent Rules

Guidance for agents working in this repository.

## Project purpose

`shim` is a Bun/TypeScript CLI for installing and running command-line tools through managed shims.

The project is about creating a reliable boundary between user-facing executable commands and the package managers/runtimes that provide those commands. A tool may come from different ecosystems over time, but the CLI should present a consistent experience for installing, listing, locating, checking, upgrading, removing, and executing shims.

Long-term design goals:

- keep installed tools isolated from each other
- make runtime selection and provisioning explicit
- keep shim generation deterministic and auditable
- preserve a provider-aware registry of installed tools and bins
- support additional package providers and runtimes without rewriting the core CLI
- prefer durable architecture over one-off command-specific workarounds

Avoid writing guidance or code that assumes only one package ecosystem or one runtime will ever exist.

## Source layout

```txt
src/
  cli/              command-line interface wiring and user-facing command modules
  core/             domain logic shared across providers and runtimes
  providers/        package ecosystem integrations
  runtimes/         runtime provisioning and runtime-specific behavior
  support/          generic infrastructure and process/filesystem helpers
  index.ts          executable entrypoint
```

Directory responsibilities:

- `cli/` should parse user intent, call domain/provider operations, and render output.
- `core/` should contain product concepts such as registry, shims, home layout, and shared models.
- `providers/` should contain package-manager or ecosystem-specific behavior.
- `runtimes/` should contain runtime-specific download, resolution, and executable path logic.
- `support/` should contain reusable technical helpers with no product policy when possible.

Keep `src/index.ts` small. It should bootstrap the CLI and handle top-level errors, not contain command or domain logic.

## Module organization

Prefer folder modules over mixed top-level files:

```txt
some-module/
  index.ts
  constants.ts
  types.ts
  ...focused implementation files
```

Guidelines:

- Avoid junk-drawer modules.
- Split files when responsibilities diverge, not just to satisfy line-count rules.
- Keep constants close to the domain they describe.
- Use semantic constants for real policy or protocol values.
- Do not create meaningless constants only to appease lint rules.
- Preserve clear dependency direction: `cli` calls into `core`/`providers`; providers may use `core`, `runtimes`, and `support`; `support` should not depend on product modules.

## Imports and aliases

Use the single project alias:

```ts
import { loadRegistry } from "@/core/registry";
import { loadConfig } from "@/core/config";
```

Alias configuration should remain centralized in `tsconfig.json`:

```json
"paths": {
  "@/*": ["./src/*"]
}
```

Do not add parallel alias definitions in `package.json#imports` unless there is a concrete runtime requirement and the tradeoff is documented.

## Bun-first workflow

Default to Bun instead of Node.js tooling.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`.
- Use `bun run <script>` instead of `npm run`, `yarn run`, or `pnpm run`.
- Use `bun install` instead of npm/yarn/pnpm install commands.
- Use `bunx <package> <command>` instead of `npx`.
- Use `bun test` for tests.
- Use `bun build` / `bun run build` for builds.
- Bun automatically loads `.env`; do not add `dotenv`.

Common project commands:

```sh
bun run dev
bun run fmt
bun run fmt:check
bun run lint
bun run typecheck
bun run build
bun run test
bun run test:int
bun run test:smoke
```

## TypeScript guidance

This project uses strict TypeScript and native TypeScript preview typechecking:

```sh
bun run typecheck
```

The typecheck script runs:

```sh
tsgo --noEmit -p tsconfig.json
```

Guidelines:

- Keep strict TypeScript settings intact.
- Keep code compatible with `erasableSyntaxOnly`.
- Prefer explicit return types for functions.
- Prefer `type` aliases for object shapes.
- Avoid `any`; use `unknown` plus explicit guards for external data.
- Treat network responses, registry files, process output, and package metadata as untrusted until validated.
- Use type-only imports where appropriate.
- Do not weaken type settings to make implementation easier.

## oxlint guidance

Lint with:

```sh
bun run lint
```

Fix real code issues. Do not weaken lint rules to make code pass.

Project policies:

- Do not silence caught errors with patterns like `void caughtError`.
- Preserve, inspect, or rethrow caught errors intentionally.
- Re-throw unexpected errors.
- Distinguish expected probe failures from real failures when checking filesystem/process state.
- Do not replace magic numbers with meaningless local aliases like `EMPTY_LENGTH`.
- Use semantic module-local constants only when the name captures real meaning.
- Avoid default exports.
- Avoid import cycles.
- Do not use `console` directly in CLI code; use output helpers.

## oxfmt guidance

Format with:

```sh
bun run fmt
```

Check formatting with:

```sh
bun run fmt:check
```

Let `oxfmt` own formatting and import ordering. Do not hand-format around it.

If alias or import grouping behavior changes, update formatter configuration intentionally and verify with `bun run fmt:check`.

## Testing guidance

Prefer high-level behavior tests while the internal structure is still evolving.

Test tiers:

- `bun run test` — fast CLI tests that avoid network and real package installs.
- `bun run test:int` — compiled-binary integration tests using temporary `SHIM_HOME`, local HTTP fixtures, and local npm tarballs.
- `bun run test:smoke` — real npm/Node lifecycle smoke test for release confidence.

Regression policy:

- Every important bug or review finding that gets fixed should get a direct regression test in the same change.
- Important issues include safety, data loss, registry consistency, path traversal, runtime isolation, rollback, locking, upgrade policy, and wrong-tool execution/removal bugs.
- Prefer a compiled-binary `tests/int/` test for install, remove, upgrade, shim, runtime, registry transaction, or provider behavior.
- Use `tests/cli/` for fast command behavior that does not require real installs.
- Use `tests/smoke/` only for real external-network lifecycle checks.
- When a PR review or bug report identifies multiple concrete issues, add or update `tests/REGRESSIONS.md` to map each issue to the exact test file and test name that prevents it from returning.
- Do not rely only on a manual smoke test for a fixed correctness or safety issue unless deterministic coverage is impractical; if so, document the tradeoff.

## Validation before finishing changes

For normal code changes, run:

```sh
bun run test
bun run fmt:check
bun run lint
bun run typecheck
bun run build
```

For install, remove, upgrade, provider, runtime, shim, registry, lock, or rollback behavior changes, also run:

```sh
bun run test:int
```

For user-visible CLI lifecycle changes or release validation, run an isolated smoke test with a temporary home directory:

```sh
bun run test:smoke
```

Smoke coverage should include the relevant lifecycle, such as:

- install or create a managed tool
- list or inspect the managed state
- resolve the generated executable path
- execute the shim or generated command
- run health checks if affected
- remove the tool or clean up state
- verify the final state is correct

Avoid smoke tests that modify the real user-level shim home unless explicitly requested.

## Provider and runtime design

When adding or changing provider/runtime behavior:

- keep provider-specific package-manager logic under `providers/<provider>/`
- keep runtime-specific logic under `runtimes/<runtime>/`
- keep shared registry/shim behavior in `core/`
- keep process/filesystem/path helpers in `support/`
- avoid hardcoding assumptions from one ecosystem into core modules
- model provider and runtime identifiers explicitly
- preserve registry compatibility or provide a deliberate migration path

Provider modules should translate ecosystem-specific details into core concepts. Core modules should not need to know package-manager internals.

## Error handling

Prefer explicit, actionable errors.

- Use project error types for user-facing failures.
- Include remediation hints when helpful.
- Do not swallow unknown errors.
- Do not convert all failures to generic strings too early.
- Preserve original error information where it helps diagnosis.
- Treat filesystem existence checks differently from filesystem mutation failures.

## Dependency policy

Do not add dependencies casually.

Before adding a dependency, consider:

- whether Bun or the standard library already provides the capability
- whether the dependency belongs in runtime dependencies or dev dependencies
- whether it affects the compiled CLI
- whether it increases install, build, or maintenance complexity

Dependency and lockfile changes should be intentional and scoped to the task.
