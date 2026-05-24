<div align="center">

# CCS Docker Deployment

![CCS Logo](../assets/ccs-logo-medium.png)

### Run CCS in Docker, locally or over SSH.
Persistent config, restart on reboot.

**[Back to README](../README.md)**

</div>

> **[Deprecation]** `ghcr.io/kaitranntt/ccs-dashboard:latest` is deprecated.
> Migrate to `ghcr.io/kaitranntt/ccs:latest`. See [Migration](#migration-from-ccs-dashboardlatest) below.

<br>

<!-- quickstart-snippet-start -->
## Quick Start (Docker)

With Docker installed:

```bash
curl -fsSL https://ccs.kaitran.ca/docker-compose.yaml -o docker-compose.yaml
docker compose up -d
```

Dashboard at http://localhost:3000 · CLIProxy at http://localhost:8317.

Need a corporate-proxy alternative? Download directly:
`https://raw.githubusercontent.com/kaitranntt/ccs/main/docker/compose.yaml`
<!-- quickstart-snippet-end -->

---

## Choosing an image

| Tag | Use | Approx. size | Status |
|---|---|---|---|
| `ghcr.io/kaitranntt/ccs:latest` | CCS + CLIProxy, no AI CLIs bundled | < 350 MB | **Recommended** |
| `ghcr.io/kaitranntt/ccs-dashboard:latest` | Legacy all-in-one image | > 600 MB | **Deprecated** — migrate to `ccs:latest`. Sunset after 2 releases. See [#1251](https://github.com/kaitranntt/ccs/issues/1251) |

`ccs:latest` also publishes pinned version tags (`ccs:<major>.<minor>.<patch>`, `ccs:<major>.<minor>`, `ccs:<major>`) for reproducible deployments.

**Need claude-code, gemini-cli, grok-cli, or opencode?** Run those tools in a sibling container attached to `ccs-net` — see [Connect your app to CLIProxy](#connect-your-app-to-cliproxy). This keeps each tool independently versioned and prevents supply-chain bloat in the CLIProxy image.

---

## Power-user: `ccs docker`

The CLI ships a first-class Docker command suite for the integrated CCS + CLIProxy stack:

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

### Network Binding and Dashboard Auth

The integrated Docker stack publishes the dashboard and CLIProxy ports on `127.0.0.1` by default. This keeps the services reachable from the Docker host and SSH tunnels without exposing them on every host interface.

For remote hosts, prefer an SSH tunnel:

```bash
ssh -L 3000:localhost:3000 my-server
# Then open http://localhost:3000 in browser
```

Only bind publicly when you have enabled dashboard authentication and have intentionally placed the host behind trusted network controls:

```bash
CCS_DOCKER_BIND_HOST=0.0.0.0 ccs docker up --host my-server
```

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

Generate a bcrypt hash without putting the password in shell history or process arguments:

```bash
docker exec -i ccs-cliproxy node -e "const fs=require('fs'); const bcrypt=require('bcrypt'); const password=fs.readFileSync(0,'utf8').trimEnd(); console.log(bcrypt.hashSync(password, 10));"
# then type/paste the password followed by Enter (stdin is not exposed via argv)
```

> **Note:** Do not commit the password hash in `docker-compose.yml`. Use Docker secrets or a `.env` file (not tracked in git) for sensitive values like `CCS_DASHBOARD_PASSWORD_HASH`.

After configuring auth, restart the dashboard:

```bash
docker exec ccs-cliproxy supervisorctl -c /etc/supervisord.conf restart ccs-dashboard
```

### Docker CLIProxy Secrets

On first startup, the integrated container generates per-install CLIProxy API and management secrets when the config is missing custom values. If you have already configured `cliproxy.auth.api_key` or `cliproxy.auth.management_secret`, Docker preserves those custom values.

If you upgraded from an older Docker deployment that used the historical `ccs-internal-managed` API key, CCS keeps that legacy key valid beside the new per-install key for 14 days by default. During the grace period, every `ccs docker up` prints the masked new key and expiry date to stderr. Reveal the full key only with `ccs docker show-key --full`. Override the window with `CCS_DOCKER_LEGACY_KEY_GRACE_DAYS`.

```bash
ccs docker show-key            # masked
ccs docker show-key --full     # reveal the current key
ccs docker finalize-key-rotation
```

Run `finalize-key-rotation` after updating clients to remove the legacy key immediately.

If a previous upgrade already replaced the old key before this grace logic was available, run once with `CCS_DOCKER_RESTORE_LEGACY_API_KEY=1` to explicitly restore the temporary legacy-key grace window. CCS does not infer this from random-looking custom keys.

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
# Create a private staging directory (0700) and print its path
STAGE_DIR=$(ssh my-server 'umask 077 && mktemp -d "${HOME}/.ccs-auth.XXXXXX"')

# Copy only JSON token files into the private staging directory
scp /path/to/auth/*.json "my-server:${STAGE_DIR}/"

# Restrict file permissions and import each staged token into the container
ssh my-server "chmod 600 \"${STAGE_DIR}\"/*.json && for f in \"${STAGE_DIR}\"/*.json; do docker cp \"\$f\" ccs-cliproxy:/root/.ccs/cliproxy/auth/; done"

# Restart CLIProxy to load new tokens
ssh my-server "docker exec ccs-cliproxy supervisorctl -c /etc/supervisord.conf restart cliproxy"

# Clean up private staging files
ssh my-server "rm -rf \"${STAGE_DIR}\""
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

# 5. Test dashboard API (from remote -- requires auth + HTTPS)
read -r -s CCS_DASHBOARD_PASSWORD && echo
curl -fsS -X POST https://<host>:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"admin\",\"password\":\"${CCS_DASHBOARD_PASSWORD}\"}"
unset CCS_DASHBOARD_PASSWORD
```

Expected healthy output:
- Container status: `healthy`
- Both supervisor services: `RUNNING`
- CLIProxy health: `cliproxy-port: ok, CLIProxy running`
- Client count matches number of auth token files

---

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

Release-tag images are published as `ghcr.io/kaitranntt/ccs:<version>` for reproducible deployments.

### Build Locally

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

---

## Connect Your App to CLIProxy

The CCS container joins a Docker network named `ccs-net`. This network name is a **stable, public contract** — it will not change without a SemVer-major release.

### Network Contract

| Resource | Stable name | Notes |
|---|---|---|
| Network | `ccs-net` | Attach any sibling container to this network |
| Service DNS | `ccs` | Resolves to the CCS container from inside `ccs-net` |
| CLIProxy port | `8317` | OAuth proxy — use as `OPENAI_BASE_URL` / `CLIPROXY_URL` |
| Dashboard port | `3000` | Web UI |
| Env-friendly URL | `http://ccs:8317` | Drop into your app's env without port-mapping on the host |

### Pattern A — Same Compose File

Declare `ccs-net` as external in your own compose file and add your service to it:

```yaml
services:
  my-app:
    image: my-app:latest
    environment:
      CLIPROXY_URL: http://ccs:8317
    networks:
      - ccs-net

networks:
  ccs-net:
    external: true
```

Start CCS first so the network exists:

```bash
docker compose -f docker/compose.yaml up -d   # or: ccs docker up
docker compose -f my-app/compose.yaml up -d
```

### Pattern B — `docker run`

Attach a container at runtime without modifying any compose file:

```bash
docker run --rm \
  --network ccs-net \
  -e CLIPROXY_URL=http://ccs:8317 \
  my-app:latest
```

### Troubleshooting Network Issues

**Service not resolvable from sibling container**

Verify both containers are on `ccs-net`:

```bash
docker network inspect ccs-net
```

The output should list both `ccs` and your app container under `Containers`.

**Network not found**

The `ccs-net` network is created when the CCS stack starts. Run:

```bash
docker compose -f docker/compose.yaml up -d
# or: ccs docker up
```

**Conflict with an existing `ccs-net`**

If you already have a network named `ccs-net` from unrelated tooling, either rename yours or scope
the CCS project via `COMPOSE_PROJECT_NAME`:

```bash
COMPOSE_PROJECT_NAME=myproject docker compose -f docker/compose.yaml up -d
# Network becomes: myproject_ccs-net
```

Note: scoping changes the network name, so sibling compose files must use the same project name.

**Podman / rootless containers**

On rootless Podman, network names and DNS resolution may behave differently. Verify your Podman
version supports `--network` with named networks (`podman network ls`) and that `aardvark-dns` or
equivalent is installed for container-name resolution.

**Low MTU on Hetzner and other cloud providers**

Some cloud environments set a low MTU (e.g., 1450) on their overlay networks. If you see packet
fragmentation or stalled requests, add a custom MTU to the network in `compose.yaml`:

```yaml
networks:
  ccs-net:
    name: ccs-net
    driver_opts:
      com.docker.network.driver.mtu: "1450"
```

---

## Migration from `ccs-dashboard:latest`

`ghcr.io/kaitranntt/ccs-dashboard:latest` is deprecated and will stop publishing after 2 more
releases. Migrate to `ghcr.io/kaitranntt/ccs:latest` now.

### Steps

1. **Stop the old stack.**

   ```bash
   docker compose down
   # or if running via docker run:
   docker stop ccs-dashboard && docker rm ccs-dashboard
   ```

2. **Preserve your data.**

   Existing `~/.ccs` data on the host is not affected by the container change. If you were using
   a named volume (`ccs_home`), it persists automatically. If you were bind-mounting your host
   `~/.ccs`, continue doing so — just update the compose file path below.

3. **Get the new compose file.**

   ```bash
   curl -fsSL https://ccs.kaitran.ca/docker-compose.yaml -o docker-compose.yaml
   ```

   Or download manually from:
   `https://raw.githubusercontent.com/kaitranntt/ccs/main/docker/compose.yaml`

4. **If you were bind-mounting `~/.ccs`** (instead of using a named volume), edit the downloaded
   `docker-compose.yaml` and replace the `ccs_home` named volume with your bind mount:

   ```yaml
   volumes:
     - ~/.ccs:/root/.ccs
   ```

   Otherwise the default named volume (`ccs_home`) works out of the box. Let compose create it
   automatically, or create it manually first:

   ```bash
   docker volume create ccs_home
   ```

5. **Start the new stack.**

   ```bash
   docker compose up -d
   ```

   Dashboard at http://localhost:3000 · CLIProxy at http://localhost:8317.

   > **Warning:** Use `docker compose down` (without `-v`) to stop the stack.
   > `docker compose down -v` deletes named volumes including `ccs_home`, which
   > permanently removes your CCS configuration and auth tokens. Always omit
   > `-v` unless you intentionally want a clean wipe.

6. **Verify.**

   ```bash
   curl -fsS http://localhost:8317/
   ```

### What changes

| Old | New |
|---|---|
| `ghcr.io/kaitranntt/ccs-dashboard:latest` | `ghcr.io/kaitranntt/ccs:latest` |
| > 600 MB image | < 350 MB image |
| Monolithic all-in-one | CCS + CLIProxy (AI CLIs via sibling containers on `ccs-net`) |
| No stable network contract | `ccs-net` network, `ccs` service DNS |

---

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
docker run -p 127.0.0.1:4000:3000 -p 127.0.0.1:9317:8317 ...

# Or with compose
CCS_DASHBOARD_PORT=4000 CCS_CLIPROXY_PORT=9317 docker-compose up -d
# Public bind is opt-in:
CCS_DOCKER_BIND_HOST=0.0.0.0 docker-compose up -d
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

### Image Signatures and SBOM

All `ghcr.io/kaitranntt/ccs` images are signed with [cosign](https://docs.sigstore.dev/cosign/overview/) using keyless OIDC signing tied to the GitHub Actions workflow identity. A software bill of materials (SBOM) is attached to every image at publish time.

**Verify a specific image digest:**

```bash
cosign verify \
  --certificate-identity-regexp "https://github.com/kaitranntt/ccs/.github/workflows/docker-release.yml" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ghcr.io/kaitranntt/ccs:<version>
```

**Inspect the SBOM:**

```bash
cosign download sbom ghcr.io/kaitranntt/ccs:<version>
```
