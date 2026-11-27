# Local audit logs for agent sessions

The StackQL MCP server keeps an audit log: one JSON record per tool call. When Claude Code or Codex starts the server from your everyday configuration, the log goes wherever that configuration sends it, or is switched off. This page shows how to write it to `logs/` in this repository instead, for this repository only, without changing your everyday setup.

This is for interactive Claude Code and Codex sessions. Demos that start their own server (the `agent/` folders) choose their own audit directory; see each demo's README.

## How the server chooses the location

The location comes from the `--mcp.config` argument the server is started with.

| `server.audit` in `--mcp.config` | Where the log goes |
| --- | --- |
| `"file": {"dir": "logs"}` | `logs/` under the server's working directory, created if missing |
| `"file": {"dir": "/an/absolute/path"}` | That folder |
| not set | The working directory itself |
| `"disabled": true` | No log |

The working directory is the folder you start Claude Code or Codex in. Each server start creates one file, `stackql_mcp_server_<UTC timestamp>.log`, even if no tool is called. Each tool call appends one line. This one is from a `server_info` call:

```json
{"timestamp":"2026-11-11T09:59:32.7443577+11:00","tool":"server_info","mode":"safe","decision":"allow","query_class":"select","duration_ms":0}
```

If `--mcp.config` is passed more than once, the last one is used.

## The definition to add

Both tools need the same thing: a definition of the `stackql` server, for this repository only, whose `audit.file.dir` is `logs`. Everything else should match the definition you use every day; `claude mcp get stackql` or `codex mcp get stackql` prints it.

The examples assume `stackql` is on your `PATH` and that your application root and credentials file are under `<home>/.stackql`. Replace `<home>` with your home directory, written with forward slashes (`C:/Users/you`, `/home/you`).

## Claude Code

1. Save this as a file outside the repository, for example `stackql-local.json`. If your everyday definition has an `env` block, copy it in too.

   ```json
   {
     "command": "stackql",
     "args": [
       "mcp",
       "--mcp.server.type=stdio",
       "--approot", "<home>/.stackql",
       "--env.file", "<home>/.stackql/.env",
       "--mcp.config", "{\"server\":{\"transport\":\"stdio\",\"mode\":\"safe\",\"audit\":{\"format\":\"jsonl\",\"file\":{\"dir\":\"logs\"}}}}"
     ]
   }
   ```

2. From the root of this repository, register it at local scope.

   Bash or zsh:

   ```bash
   claude mcp add-json stackql "$(cat /path/to/stackql-local.json)" --scope local
   ```

   PowerShell 7 (`pwsh`):

   ```powershell
   claude mcp add-json stackql (Get-Content -Raw C:\path\to\stackql-local.json) --scope local
   ```

3. Check it. The scope should read "Local config" and the status "Connected".

   ```bash
   claude mcp get stackql
   ```

4. Start a new session. Sessions that are already open keep the server they started with.

To go back to your everyday definition:

```bash
claude mcp remove stackql --scope local
```

Things to know:

- Local scope is stored in your own Claude Code configuration, keyed by this repository's path. Nothing is added to the repository.
- A local definition takes the place of a `stackql` server defined at user scope, and only one copy of the server starts. The whole entry is replaced, not merged, which is why the file above repeats every argument.
- `claude mcp list` then prints a "Conflicting scopes" notice that suggests removing one of the two. That is expected here; leave both.
- The local definition also applies when you open a sub-folder of this repository. The log then goes to `logs/` in that sub-folder, because that is the working directory.
- Windows PowerShell 5.1 strips the quotes from the JSON and the command fails with "Invalid configuration". Use PowerShell 7 or Git Bash.
- If `claude` is not on your `PATH`, the VS Code extension ships the same binary under `<home>/.vscode/extensions/anthropic.claude-code-<version>-<platform>/resources/native-binary/`.

### One definition, switched by an environment variable

Claude Code expands `${VAR}` and `${VAR:-default}` inside a server's arguments, so one everyday definition can serve both cases. In your user-scope definition, write the directory as:

```text
\"dir\":\"${STACKQL_MCP_AUDIT_DIR:-<home>/.stackql/mcp-audit}\"
```

Then start Claude Code with the variable set when you want the log in the project:

```bash
STACKQL_MCP_AUDIT_DIR=logs claude
```

```powershell
$env:STACKQL_MCP_AUDIT_DIR = 'logs'; claude
```

The variable has to be in the environment Claude Code is started from. Setting it under `env` in a project's `.claude/settings.json` or `.claude/settings.local.json` did not change the expansion when this was checked.

## Codex

The StackQL plugin for Codex starts the server with the audit log disabled, from the plugin's own folder, and its command cannot be changed from configuration. A server with the same name defined in this repository takes its place.

1. Make sure Codex treats this repository as trusted. Project configuration is ignored otherwise. Codex records the decision in `<home>/.codex/config.toml`:

   ```toml
   [projects.'<absolute path to this repository>']
   trust_level = "trusted"
   ```

2. Create `.codex/config.toml` in the root of this repository:

   ```toml
   [mcp_servers.stackql]
   command = "stackql"
   args = [
     "mcp",
     "--mcp.server.type=stdio",
     "--approot", "<home>/.stackql",
     "--env.file", "<home>/.stackql/.env",
     "--mcp.config", '{"server":{"transport":"stdio","mode":"safe","audit":{"format":"jsonl","file":{"dir":"logs"}}}}',
   ]
   ```

3. Keep the file out of git. It holds paths from your machine, and `.codex/` is not in this repository's `.gitignore`. Add it to your local exclude file:

   ```bash
   echo ".codex/" >> .git/info/exclude
   ```

4. Check it from the repository root. The command should read `stackql`, not the plugin's `node ... stackql-mcp.js`.

   ```bash
   codex mcp get stackql
   ```

5. Start a new session.

To go back, delete `.codex/config.toml`.

Things to know:

- Keep the name `stackql`. With the same name, only the project's server starts. With a different name, the plugin's server starts as well and every tool appears twice.
- The working directory is the folder Codex is started in. From a sub-folder, the log goes to `logs/` in that sub-folder. To always write to the repository root, add `cwd = "<absolute path to this repository>"` to the table.

## Checking the result

Start a session at the repository root and look for a new file:

```powershell
Get-ChildItem logs\stackql_mcp_server_*.log | Sort-Object LastWriteTime | Select-Object -Last 1
```

```bash
ls -t logs/stackql_mcp_server_*.log | head -1
```

The file is empty until a tool is called. Ask the agent to call the StackQL `server_info` tool, which touches no provider, and one line appears.

## Housekeeping

- `logs/` is ignored by this repository's `.gitignore` at any depth, so these files are not committed. Keep it that way: audit records of real queries can carry resource names and account identifiers.
- Every session start adds a file, including empty ones. Clear `logs/` before a demo if you want only that run in it.
- To send your everyday log to one fixed folder rather than into whichever project you are in, set `dir` to an absolute path in your user-level definition.

## What was checked

Run on Windows 11 on 11 November 2026, with throwaway configuration directories for both tools.

| Area | Checked | Version |
| --- | --- | --- |
| Server | The four `audit` settings in the table above, and that the last `--mcp.config` wins | stackql 1.0.888 |
| Server | The sample record, from a `server_info` call in a Claude Code session in VS Code | stackql 1.0.888 |
| Claude Code | Local scope replaces user scope, one server start, working directory, log written to `logs/`, sub-folder case, removal. Through the CLI and its `claude mcp get` health check, which starts the server | 2.1.322 |
| Claude Code | `add-json` from Bash and PowerShell 7; the failure in Windows PowerShell 5.1 | 2.1.322 |
| Claude Code | `${VAR:-default}` expansion inside arguments at user scope; settings `env` not used for it | 2.1.322 |
| Codex | Project `.codex/config.toml` server replaces a user-config server and the plugin's server of the same name; ignored when the project is not trusted; working directory; `cwd`; log written to `logs/`. Session start-up only, through `codex debug prompt-input` | codex-cli 0.164.0-alpha.11.1 |

Not checked: macOS and Linux, the Claude desktop app, the Codex desktop app and IDE extension, and a tool call made from a Codex model session.
