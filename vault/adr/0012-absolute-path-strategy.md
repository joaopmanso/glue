---
status: accepted
date: 2026-09-24
---
# 0012. How exports get absolute file paths

## Context
Every DJ-app format (rekordbox XML `Location`, NML `LOCATION`, M3U8) references tracks by absolute
path. Browsers never reveal absolute paths: handles expose names and relative paths only.

## Decision
Each music root stores an optional `abs_path`:
1. **Inferred** when a library is imported: for files under the root, find the imported absolute paths
   whose suffix equals the file's relative path; the common prefix is the root's absolute path. Needs
   several agreeing matches; conflicts are shown to the user.
2. Otherwise **asked once** when the root is added or first exported: "Where is this folder on your
   computer?" with an OS-appropriate example (`C:\Users\you\Music` / `/Users/you/Music`) and a check
   that exported sample paths look plausible.
Exports are blocked for roots without an absolute path, naming the root.

## Consequences
- One small prompt at most per root; often none after an import.
- A moved or renamed root needs its path updated (Settings › Music folders).
- The desktop client fills paths automatically.
