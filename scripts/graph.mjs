// The code map (ADR 0127, 0128): graphify's knowledge graph of GLUE, kept on the branch `graphify` by
// .github/workflows/graph.yml.
//   node scripts/graph.mjs fetch     the branch's graph into graphify-out/ (git only; graphify not needed)
//   node scripts/graph.mjs publish   graphify-out/ onto the branch (one commit, replacing the last one)
// Both work through a private index, so the repo's own index and working tree are never touched.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const BRANCH = 'graphify'
const OUT = resolve('graphify-out')
// What a session needs: the graph, its report, and what lets the next update skip unchanged files (the
// manifest, the AST and semantic caches). Not the HTML view, backups, or this computer's paths.
const KEEP = ['graph.json', 'GRAPH_REPORT.md', 'manifest.json', '.graphify_labels.json', 'cache']

const run = (args, env = {}) =>
  execFileSync('git', args, { encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'] }).trim()

const gitDir = run(['rev-parse', '--absolute-git-dir'])
const scratch = mkdtempSync(join(tmpdir(), 'glue-graph-'))
const own = { GIT_INDEX_FILE: join(scratch, 'index') }
const inOut = (args) => run(['--git-dir', gitDir, '--work-tree', OUT, '-C', OUT, ...args], own)

try {
  const cmd = process.argv[2]
  if (cmd === 'fetch') {
    run(['fetch', '--quiet', 'origin', `+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}`])
    mkdirSync(OUT, { recursive: true })
    inOut(['read-tree', `origin/${BRANCH}`])
    inOut(['checkout-index', '--all', '--force'])
    console.log(`graphify-out/: ${run(['log', '-1', '--format=%s', `origin/${BRANCH}`])}`)
  } else if (cmd === 'publish') {
    if (!existsSync(join(OUT, 'graph.json'))) throw new Error('graphify-out/graph.json is missing: build the graph first')
    inOut(['add', '--force', '--', ...KEEP.filter((f) => existsSync(join(OUT, f)))])
    const tree = inOut(['write-tree'])
    const at = run(['rev-parse', '--short', 'HEAD'])
    const commit = run(['commit-tree', tree, '-m', `The code map at ${at}`])
    run(['push', '--force', '--quiet', 'origin', `${commit}:refs/heads/${BRANCH}`])
    console.log(`Published the graph at ${at} to ${BRANCH}`)
  } else {
    console.error('usage: node scripts/graph.mjs fetch|publish')
    process.exitCode = 2
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
