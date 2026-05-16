<div align="center">

# CCS Docker Deployment

![CCS Logo](../assets/ccs-logo-medium.png)

### Run CCS in Docker, locally or over SSH.
Persistent config, restart on reboot.

**[Back to README](../README.md)**

</div>

<br>

## Choosing an image

| Tag | Use | Approx. size | Status |
|---|---|---|---|
| `ghcr.io/kaitranntt/ccs:latest` | CCS + CLIProxy, no AI CLIs pre-installed | < 350 MB | **Recommended** |
| `ghcr.io/kaitranntt/ccs:full` | CCS + CLIProxy + claude-code + gemini-cli + grok-cli + opencode | < 600 MB | Supported |
| `ghcr.io/kaitranntt/ccs-dashboard:latest` | Legacy all-in-one image | > 600 MB | **Deprecated** — migrate to `ccs:latest`. Sunset after 2 releases. See [#1251](https://github.com/kaitranntt/ccs/issues/1251) |

Both `ccs:latest` and `ccs:full` also publish pinned version tags (`ccs:<major>.<minor>.<patch>`, `ccs:<major>.<minor>`, `ccs:<major>`) for reproducible deployments. The `:full` variants carry the `full-` prefix: `ccs:full-<ver>`, `ccs:full-<minor>`, etc.

## Preferred: `ccs docker`

The CLI now ships a first-class Docker command suite for the integrated CCS + CLIProxy stack:

```bash
ccs docker up
ccs docker status
ccs docker logs --follow
ccs docker config
ccs docker update
ccs docker down
```

Remote deployment stages the bundled Docker assets to `~/.ccs/docker` on the target host:

```bash
ccs docker up --host my-server
ccs docker --host my-server status
ccs docker status --host my-server
ccs docker logs --host my-server --service ccs --follow
ccs docker config --host my-server
```

Use a single SSH target or SSH config alias for `--host`. If you need custom SSH flags such as a port override, configure them in `~/.ssh/config` and reference the alias from `ccs docker`.

The `ccs docker` flow uses the integrated assets in this directory:

- `docker/Dockerfile.integrated`
- `docker/docker-compose.integrated.yml`
- `docker/supervisord.conf`
- `docker/entrypoint-integrated.sh`

### Post-Deployment: Enable Dashboard Auth (Required for Remote Access)

When accessing the dashboard from a different machine (not `localhost`), the API blocks requests with **403 Forbidden** unless authentication is configured. Without auth, the dashboard appears empty (no providers, no version).

Set up auth inside the running container:

```bash
# Interactive setup (recommended)
docker exec -it ccs-cliproxy ccs config auth setup

# Or via environment variables in docker-compose
environment:
  CCS_DASHBOARD_AUTH_ENABLED: "true"
  CCS_DASHBOARD_USERNAME: "admin"
  CCS_DASHBOARD_PASSWORD_HASH: "<bcrypt-hash>"
```

Running `ccs config auth setup` on the outer host shell updates that machine's own `~/.ccs`, not the Docker volume mounted into `ccs-cliproxy`. For the integrated stack, configure auth inside the container or provide the auth env vars in Compose.

Generate a bcrypt hash:

```bash
docker exec ccs-cliproxy node -e "console.log(require('bcrypt').hashSync('your-password', 10))"
```

> **Note:** Do not commit the password hash in `docker-compose.yml`. Use Docker secrets or a `.env` file (not tracked in git) for sensitive values like `CCS_DASHBOARD_PASSWORD_HASH`.

After configuring auth, restart the dashboard:

```bash
docker exec ccs-cliproxy supervisorctl -c /etc/supervisord.conf restart ccs-dashboard
```

If accessing from `localhost` only (e.g., via SSH tunnel), auth is not required:

```bash
ssh -L 3000:localhost:3000 my-server
# Then open http://localhost:3000 in browser
```

### Post-Deployment: Migrate Existing Auth Tokens

If you have existing CLIProxy OAuth tokens from a previous deployment, copy them into the Docker volume:

```bash
# Copy auth files into the running container
for f in /path/to/old/auth/*.json; do
  docker cp "$f" ccs-cliproxy:/root/.ccs/cliproxy/auth/
done

# Restart CLIProxy to load new tokens
docker exec ccs-cliproxy supervisorctl -c /etc/supervisord.conf restart cliproxy
```

For remote deployments via `ccs docker up --host`:

```bash
# Copy tokens into the running container (no root/sudo needed)
scp /path/to/auth/*.json my-server:/tmp/ccs-auth/
ssh my-server 'for f in /tmp/ccs-auth/*.json; do docker cp "$f" ccs-cliproxy:/root/.ccs/cliproxy/auth/; done'

# Restart CLIProxy to load new tokens
ssh my-server "docker exec ccs-cliproxy supervisorctl -c /etc/supervisord.conf restart cliproxy"

# Clean up temp files
ssh my-server "rm -rf /tmp/ccs-auth"
```

> **Tip:** `docker cp` is preferred over writing directly to Docker volume mountpoints, which require root access.

### Post-Deployment: Verification Checklist

After `ccs docker up`, verify the deployment:

```bash
# 1. Check container is healthy
ccs docker status --host my-server

# 2. Verify CLIProxy responds
curl -fsS http://<host>:8317/

# 3. Check health API (from inside container -- no auth needed)
docker exec ccs-cliproxy curl -fsS http://127.0.0.1:3000/api/health \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{d[\"summary\"][\"passed\"]} passed, {d[\"summary\"][\"errors\"]} errors')"

# 4. Verify auth tokens loaded (check client count)
docker exec ccs-cliproxy grep "client load complete" /var/log/ccs/cliproxy.log

# 5. Test dashboard API (from remote -- requires auth)
curl -fsS -X POST http://<host>:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"your-password"}'
```

Expected healthy output:
- Container status: `healthy`
- Both supervisor services: `RUNNING`
- CLIProxy health: `cliproxy-port: ok, CLIProxy running`
- Client count matches number of auth token files

## Prebuilt Image Quick Start

Pull the recommended minimal image (CCS + CLIProxy, no AI CLIs):

```bash
docker run -d \
  --name ccs \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 8317:8317 \
  -e CCS_PORT=3000 \
  -v ccs_home:/root/.ccs \
  ghcr.io/kaitranntt/ccs:latest
```

Or pull the full image with all 4 AI CLIs pre-installed:

```bash
docker run -d \
  --name ccs \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 8317:8317 \
  -e CCS_PORT=3000 \
  -v ccs_home:/root/.ccs \
  ghcr.io/kaitranntt/ccs:full
```

Release-tag images are published as `ghcr.io/kaitranntt/ccs:<version>` (minimal) and `ghcr.io/kaitranntt/ccs:full-<version>` (full).

### Legacy image (deprecated)

The `ghcr.io/kaitranntt/ccs-dashboard:latest` image continues building for 2 more releases but
emits a deprecation warning on startup. Migrate to `ccs:latest` at your earliest convenience.

## Prebuilt Image Build Locally

```bash
docker build -f docker/Dockerfile -t ccs-dashboard:latest .
docker run -d \
  --name ccs-dashboard \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 8317:8317 \
  -e CCS_PORT=3000 \
  -v ccs_home:/home/node/.ccs \
  ccs-dashboard:latest
```

Open `http://localhost:3000` (Dashboard).

CCS also starts CLIProxy on `http://localhost:8317` (used by Dashboard features and OAuth providers).

## Environment Variables

Common CCS environment variables (from the docs):

- Docs: [Environment variables](https://docs.ccs.kaitran.ca/getting-started/configuration#environment-variables)

- `CCS_CONFIG`: override config file path
- `CCS_UNIFIED_CONFIG=1`: force unified YAML config loader
- `CCS_MIGRATE=1`: trigger config migration
- `CCS_SKIP_MIGRATION=1`: skip migrations
- `CCS_DEBUG=1`: enable verbose logs
- `NO_COLOR=1`: disable ANSI colors
- `CCS_SKIP_PREFLIGHT=1`: skip API key validation checks
- `CCS_WEBSEARCH_SKIP=1`: skip WebSearch hook integration
- Proxy: `CCS_PROXY_HOST`, `CCS_PROXY_PORT`, `CCS_PROXY_PROTOCOL`, `CCS_PROXY_AUTH_TOKEN`, `CCS_PROXY_TIMEOUT`, `CCS_PROXY_FALLBACK_ENABLED`, `CCS_ALLOW_SELF_SIGNED`

Example (passing env vars to the running container):

```bash
docker run -d \
  --name ccs-dashboard \
  --restart unless-stopped \
  -p 3000:3000 \
  -p 8317:8317 \
  -e CCS_PORT=3000 \
  -e CCS_DEBUG=1 \
  -e NO_COLOR=1 \
  -e CCS_PROXY_HOST="proxy.example.com" \
  -e CCS_PROXY_PORT=443 \
  -e CCS_PROXY_PROTOCOL="https" \
  -v ccs_home:/home/node/.ccs \
  ghcr.io/kaitranntt/ccs-dashboard:latest
```

## Useful Commands

```bash
docker logs -f ccs-dashboard
docker stop ccs-dashboard
docker start ccs-dashboard
docker rm -f ccs-dashboard
```

## Prebuilt Image Docker Compose (Optional)

Using the included `docker/docker-compose.yml`:

```bash
docker-compose -f docker/docker-compose.yml up --build -d
docker-compose -f docker/docker-compose.yml logs -f
```

Stop:

```bash
docker-compose -f docker/docker-compose.yml down
```

For the integrated CCS + CLIProxy stack managed by the CLI, use `ccs docker up` instead.

## Persistence

- CCS stores data in `/home/node/.ccs` inside the container.
- The examples use a named volume (`ccs_home`) to persist that data.
- Compose also persists `/home/node/.claude`, `/home/node/.opencode`, and `/home/node/.grok-cli` via named volumes.

## Resource Limits

For production deployments, limit container resources:

```bash
docker run -d \
  --name ccs-dashboard \
  --restart unless-stopped \
  --memory=1g \
  --cpus=2 \
  -p 3000:3000 \
  -p 8317:8317 \
  -v ccs_home:/home/node/.ccs \
  ghcr.io/kaitranntt/ccs-dashboard:latest
```

Docker Compose includes default limits (1GB RAM, 2 CPUs). Adjust in `docker-compose.yml` under `deploy.resources`.

## Graceful Shutdown

CCS handles `SIGTERM` gracefully. When stopping the container:

```bash
docker stop ccs-dashboard        # Sends SIGTERM, waits 10s, then SIGKILL
docker stop -t 30 ccs-dashboard  # Wait 30s for graceful shutdown
```

The `init: true` in docker-compose.yml ensures proper signal forwarding.

## Troubleshooting

### Permission Errors (EACCES)

If you see permission errors on startup:

```bash
# Check volume permissions
docker exec ccs-dashboard ls -la /home/node/.ccs

# Fix by recreating volumes
docker-compose down -v
docker-compose up -d
```

### Port Already in Use

```bash
# Check what's using the port
lsof -i :3000
lsof -i :8317

# Use different ports
docker run -p 4000:3000 -p 9317:8317 ...

# Or with compose
CCS_DASHBOARD_PORT=4000 CCS_CLIPROXY_PORT=9317 docker-compose up -d
```

### Container Keeps Restarting

```bash
# Check logs for errors
docker logs ccs-dashboard --tail 50

# Check container health
docker inspect ccs-dashboard --format='{{.State.Health.Status}}'
```

### Dashboard Shows Empty (No Providers, Wrong Version)

If the dashboard page loads but shows "0 providers", "Not running", or version "v5.0.0":

**Cause:** The dashboard API blocks non-localhost requests when auth is disabled (security feature). The page HTML loads from any host, but all API calls return 403.

**Fix:** Enable dashboard authentication:

```bash
docker exec -it ccs-cliproxy ccs config auth setup
docker exec ccs-cliproxy supervisorctl -c /etc/supervisord.conf restart ccs-dashboard
```

Then log in at the dashboard URL. See [Post-Deployment: Enable Dashboard Auth](#post-deployment-enable-dashboard-auth-required-for-remote-access) above.

### CLIProxy Shows 0 Clients After Token Migration

If CLIProxy logs show "0 clients" after copying auth tokens:

```bash
# CLIProxy needs a restart to detect new auth files
docker exec ccs-cliproxy supervisorctl -c /etc/supervisord.conf restart cliproxy

# Verify tokens loaded
docker exec ccs-cliproxy grep "client load complete" /var/log/ccs/cliproxy.log
```

### ETXTBSY Error on First Boot

On first container start, you may see `ETXTBSY: text file is busy` in dashboard logs. This is a known race condition where the dashboard tries to update the CLIProxy binary while it's already running. The dashboard recovers automatically on the next attempt. No action needed.

### Debug Mode

Enable verbose logging:

```bash
docker run -e CCS_DEBUG=1 ...
```

## Examples: Claude + Gemini inside Docker

Open a shell inside the running container:

```bash
docker exec -it ccs-dashboard bash
```

Claude (non-interactive / print mode):

```bash
docker exec -it ccs-dashboard claude -p "Hello from Docker"
```

Gemini (one-shot prompt):

```bash
docker exec -it ccs-dashboard gemini "Hello from Docker"
```

If you need to configure credentials, do it according to each CLI's docs:

```bash
docker exec -it ccs-dashboard claude --help
docker exec -it ccs-dashboard gemini --help
```

## Security Notes

- **Secrets**: For sensitive values like `CCS_PROXY_AUTH_TOKEN`, consider using Docker secrets or a `.env` file (not committed to git).
- **Network**: The container exposes ports 3000 and 8317. In production, use a reverse proxy (nginx, traefik) with TLS.
- **Updates**: Regularly rebuild the image to get security patches: `docker-compose build --pull`
