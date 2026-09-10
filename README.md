# NestNyx

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/linuxofpower/NestNyx)

NestNyx is the execution side of Nyx storage operations. ChatGPT can inspect and plan against explicitly shared Google Drive folders; NestNyx executes a small allow-listed set of `rclone` operations against those same logical shared-folder roots.

The boundary is deliberate: **the API never accepts arbitrary rclone remote names or unrestricted Drive roots**. Every path is resolved below a configured shared folder.

## V0 capabilities

- NestJS HTTP API suitable for Heroku.
- Installs the official rclone binary during the Node build.
- Keeps `rclone.conf` out of Git; provide it as a Heroku config var.
- Maps logical areas such as `A`, `B`, `C`, `D` to shared-folder roots at runtime.
- Lists and stats files only below those roots.
- Queues cross-account file copies.
- After every copy, reads source/destination hashes, size, and destination owner.
- Marks a copy `trusted` only when size, a common hash, and the configured expected destination owner all match.
- Does **not** delete source files. Cleanup is intentionally a later, separate capability.
- If `DATABASE_URL` is configured, jobs are persisted in Postgres and interrupted `running` jobs are re-queued when the app starts.

## Required config vars

`NYX_API_KEY`
: Secret sent as `X-Nyx-Key` on every storage API call.

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

Set local variables for testing:

```bash
export NYX_API_KEY='replace-me'
export RCLONE_CONFIG_B64="$(cat /tmp/rclone-config.b64)"
export NYX_SHARED_ROOTS_JSON='{"A":{"remote":"drive_a","root":"A_Shared","expectedOwner":"account-a@example.com"}}'
```

Then:

```bash
npm install
npm run start:dev
```

## API

Health does not require the API key:

```bash
curl http://localhost:3000/health
```

List configured logical areas:

```bash
curl -H "X-Nyx-Key: $NYX_API_KEY" http://localhost:3000/storage/areas
```

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

For the first deployment, use a tiny disposable file and confirm the returned verification reports the expected destination owner. Only after that should larger archive transfers be queued.

## Safety contract

V0 intentionally implements:

```text
PLAN -> VALIDATE SHARED ROOTS -> COPY -> READBACK -> HASH/SIZE CHECK -> OWNER CHECK -> EVIDENCE
```

There is no source-delete or move endpoint. A later cleanup workflow can be added only after the copy evidence has been persisted and independently accepted.
