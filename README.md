# NestNyx

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/linuxofpower/NestNyx)

NestNyx is the execution side of Nyx storage operations. ChatGPT can inspect explicitly shared Google Drive folders and, through the MCP endpoint, call a small allow-listed set of storage tools. NestNyx executes those tools with `rclone` against the same logical shared-folder roots.

The boundary is deliberate: **neither REST nor MCP accepts arbitrary rclone remote names or unrestricted Drive roots**. Every path is resolved below a configured shared folder.

## V0 capabilities

- NestJS HTTP API suitable for Heroku.
- Remote MCP endpoint suitable for AI hosts that support MCP over HTTP.
- MCP v2 server using the official Model Context Protocol TypeScript SDK, with compatibility for 2025-era stateless clients.
- Installs the official rclone binary during the Node build.
- Keeps `rclone.conf` out of Git; provide it as a Heroku config var.
- Maps logical areas such as `A`, `B`, `C`, `D` to shared-folder roots at runtime.
- Lists and stats files only below those roots.
- Reports aggregate account capacity for the remotes backing those shared roots, while keeping file operations scoped to the shared folders.
- Queues cross-account file copies from MCP or REST.
- Refuses destination clobbering with rclone `--immutable`.
- After every copy, reads source/destination hashes, size, and destination owner.
- Marks a copy `trusted` only when size, a common hash, and the configured expected destination owner all match.
- Does **not** delete source files. Cleanup is intentionally a later, separate capability.
- If `DATABASE_URL` is configured, jobs are persisted in Postgres and interrupted `running` jobs are re-queued when the app starts.

## Architecture

```text
ChatGPT / Nyx
    |
    | Google Drive connector: inspect shared folders
    | NestNyx MCP: request approved actions
    v
NestNyx on Heroku
    |
    | validate logical area + relative path
    v
rclone
    |
    +--> Google Drive account A
    +--> Google Drive account B
    +--> Google Drive account C
    +--> Google Drive account D
```

The shared folders are the GPT-visible control surface. The rclone remotes are the private execution/data plane. A tool call references only logical areas and relative paths; NestNyx owns the private mapping from those areas to rclone remotes.

## Required config vars

`NYX_API_KEY`
: Secret sent as `X-Nyx-Key` on every protected REST storage API call.

`NYX_MCP_TOKEN`
: Separate long random token protecting the MCP endpoint. For the initial private V0, ChatGPT can be configured with the secret-bearing endpoint URL `https://YOUR-APP.herokuapp.com/mcp/NYX_MCP_TOKEN`. Treat that URL itself as a credential and rotate the token if it is exposed. OAuth should replace this URL-token mechanism before wider/shared use.

`RCLONE_CONFIG_B64`
: Base64 of your existing `rclone.conf`. Never commit the decoded or encoded config to Git.

`NYX_SHARED_ROOTS_JSON`
: Logical names mapped to rclone remotes and shared folders. Use real remote names and owner emails only in Heroku config vars, not in this public repository.

Example shape:

```json
{
  "A": { "remote": "drive_a", "root": "A_Shared", "expectedOwner": "account-a@example.com" },
  "B": { "remote": "drive_b", "root": "B_Shared", "expectedOwner": "account-b@example.com" }
}
```

Remote names in this JSON must match names inside the uploaded rclone configuration.

## Local preparation

Encode the existing config without printing its contents:

```bash
base64 -w0 ~/.config/rclone/rclone.conf > /tmp/rclone-config.b64
```

Generate local secrets:

```bash
export NYX_API_KEY="$(openssl rand -hex 32)"
export NYX_MCP_TOKEN="$(openssl rand -hex 32)"
```

Set the remaining local variables:

```bash
export RCLONE_CONFIG_B64="$(cat /tmp/rclone-config.b64)"
export NYX_SHARED_ROOTS_JSON='{"A":{"remote":"drive_a","root":"A_Shared","expectedOwner":"account-a@example.com"}}'
```

Then:

```bash
npm install
npm run start:dev
```

## MCP endpoint

Two endpoint forms are available:

```text
/mcp
/mcp/:token
```

`/mcp` accepts `Authorization: Bearer <NYX_MCP_TOKEN>` or `X-Nyx-MCP-Token: <NYX_MCP_TOKEN>` for manual clients.

For the initial ChatGPT V0, use the secret URL form:

```text
https://YOUR-APP.herokuapp.com/mcp/YOUR_NYX_MCP_TOKEN
```

The MCP route is excluded from the REST API-key guard and performs its own constant-time token check. Invalid tokens return `404` so the private endpoint is not advertised.

### MCP tools

`nyx_areas`
: List configured logical shared-folder areas.

`nyx_list`
: List files/folders below one configured shared root.

`nyx_stat`
: Read size, hashes, metadata, and owner for one file below a configured shared root.

`nyx_capacity`
: Read account quota information for the unique rclone remotes backing the configured areas.

`nyx_copy_file`
: Queue a cross-area copy. Destination overwrite is refused, source is retained, and the worker verifies size + common hash + destination owner.

`nyx_job_status`
: Read queued/running/succeeded/failed state plus verification evidence.

### MCP smoke test

After starting locally, list the available tools with an MCP client/inspector, or send a protocol request to the protected endpoint. The recommended production test is to connect an MCP host and call `nyx_areas`, then `nyx_list` on one area before any write action.

## REST API

Health does not require the API key:

```bash
curl http://localhost:3000/health
```

List configured logical areas:

```bash
curl -H "X-Nyx-Key: $NYX_API_KEY" http://localhost:3000/storage/areas
```

Read total/used/free quota across the unique rclone remotes backing the configured shared roots:

```bash
curl -H "X-Nyx-Key: $NYX_API_KEY" http://localhost:3000/storage/capacity
```

Capacity is account-level information reported by rclone. It does not widen the API boundary: listing, stat, and copy operations remain restricted to the configured shared-folder roots.

List a shared-folder path:

```bash
curl -G -H "X-Nyx-Key: $NYX_API_KEY" \
  --data-urlencode 'path=archives' \
  http://localhost:3000/storage/A/list
```

Queue a file copy:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Nyx-Key: $NYX_API_KEY" \
  http://localhost:3000/storage/jobs/copy-file \
  -d '{
    "source":{"area":"A","path":"incoming/example.zip"},
    "destination":{"area":"B","path":"archive/example.zip"},
    "verify":true
  }'
```

Poll the returned job ID:

```bash
curl -H "X-Nyx-Key: $NYX_API_KEY" \
  http://localhost:3000/storage/jobs/JOB_ID
```

A successful verified result includes the destination owner and `trusted: true`.

## Heroku deployment from GitHub

Use the **Deploy to Heroku** button at the top of this README, or connect this repository from an existing Heroku app's **Deploy -> GitHub** tab. Heroku's GitHub integration can build and release pushes to the selected branch.

The app binds to Heroku's `PORT`, and the root `Procfile` starts the compiled NestJS service.

Before moving large files, configure durable jobs by provisioning Heroku Postgres and letting Heroku supply `DATABASE_URL`:

```bash
heroku addons:create heroku-postgresql:essential-0 -a YOUR_APP_NAME
```

Then configure secrets and mappings in the Heroku dashboard or CLI. Do not put them in GitHub.

For the first deployment, call `nyx_areas` and `nyx_list`, then use one tiny disposable A -> B copy and confirm the returned verification reports the expected destination owner. Only after that should larger archive transfers be queued.

## ChatGPT connection

NestNyx is now shaped as a remote MCP server. In ChatGPT Developer Mode, create a custom app/connector using the protected MCP endpoint URL and scan its tools. For the V0 secret-URL endpoint, choose no additional authentication because the random path segment itself is the bearer credential. Do not publish or share that URL.

For a production-quality multi-user connector, replace the URL token with OAuth/OIDC and short-lived access tokens.

Important product note: ChatGPT plan support for custom MCP write actions is controlled by ChatGPT, not NestNyx. If the current ChatGPT plan only allows read/fetch MCP tools, `nyx_copy_file` will not be callable from ChatGPT even though the server exposes it. The same MCP server can still be tested with another MCP client.

## Filling the multi-account pool

The intended workflow for using capacity spread across several Google accounts is:

```text
PLAN IN CHATGPT
  -> inspect only shared folders
  -> call nyx_capacity
  -> choose a destination area with enough free quota
  -> call nyx_copy_file
  -> NestNyx validates both paths are below configured shared roots
  -> rclone copies account-to-account
  -> NestNyx checks size + common hash + destination owner
  -> persist evidence
  -> call nyx_job_status until terminal
```

V0 fills additional account space by making verified copies. Source deletion is deliberately not coupled to copy because a successful transfer alone is not enough evidence for destructive cleanup.

## Safety contract

V0 intentionally implements:

```text
PLAN -> VALIDATE SHARED ROOTS -> COPY (NO CLOBBER) -> READBACK -> HASH/SIZE CHECK -> OWNER CHECK -> EVIDENCE
```

There is no source-delete or move endpoint yet. A later cleanup workflow can be added only after copy evidence has been persisted and independently accepted.
