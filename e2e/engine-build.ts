/* Before the tests: GLUE Home's library engine built for them (crates/glue-engine's test binary, which
   e2e/fakeHome.ts runs, ADR 0153). Cargo builds only what changed: a second or two when nothing did. */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

export default function build() {
  const env = { ...process.env };
  // The laptop's Rust lives in C:\Work\rust (its policy blocks programs under %USERPROFILE%\.cargo), maybe not on the PATH.
  const rust = 'C:\\Work\\rust';
  if (existsSync(join(rust, 'cargo', 'bin'))) {
    env.CARGO_HOME ??= join(rust, 'cargo'); env.RUSTUP_HOME ??= join(rust, 'rustup');
    env.PATH = join(env.CARGO_HOME, 'bin') + delimiter + (env.PATH ?? env.Path ?? '');
    delete env.Path;
  }
  execFileSync('cargo', ['build', '--manifest-path', 'crates/glue-engine/Cargo.toml', '--bin', 'glue-engine-test'], { env, stdio: 'inherit' });
}
