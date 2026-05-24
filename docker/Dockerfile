# syntax=docker/dockerfile:1.7

# =============================================================================
# Build stage: compile TypeScript and build UI
# Bun is used here for speed; npm lockfile is generated for the runtime stage.
# =============================================================================
FROM node:20-bookworm-slim AS build

SHELL ["/bin/bash", "-lc"]

# Pin bun version for reproducible builds
ARG BUN_VERSION=1.2.21
ENV BUN_INSTALL=/usr/local/bun
ENV PATH="$BUN_INSTALL/bin:$PATH"

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates unzip \
  && rm -rf /var/lib/apt/lists/*

# Install specific bun version
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"

WORKDIR /app

# Dependency install layer (avoid running install scripts inside the image build)
COPY package.json bun.lock bunfig.toml ./
COPY ui/package.json ui/bun.lock ./ui/

RUN bun install --frozen-lockfile --ignore-scripts \
  && (cd ui && bun install --frozen-lockfile --ignore-scripts)

COPY . .

RUN bun run build:all

# Validate build artifacts exist
RUN test -d dist && test -d lib && echo "[OK] Build artifacts validated"

# Build runtime deps from the committed bun.lock to keep Docker installs pinned.
# --ignore-scripts avoids user-home side effects from postinstall during image build.
RUN --mount=type=cache,target=/root/.bun \
    bun install --frozen-lockfile --production --ignore-scripts

# =============================================================================
# Runtime stage: Node-only, no Bun
# =============================================================================
FROM node:20-bookworm-slim AS runtime

SHELL ["/bin/bash", "-lc"]

# opencode installs its binary to /home/node/.opencode/bin — keep on PATH
ENV PATH="/home/node/.opencode/bin:$PATH"

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates unzip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy pinned production dependencies resolved from the committed bun.lock.
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules

COPY docker/entrypoint.sh /usr/local/bin/ccs-entrypoint
RUN chmod +x /usr/local/bin/ccs-entrypoint

COPY --from=build /app/dist ./dist
COPY --from=build /app/lib ./lib
COPY --from=build /app/config ./config
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/README.md ./README.md
COPY --from=build /app/LICENSE ./LICENSE

# Install AI CLI tools (using latest - pin versions in production if needed)
# These are optional tools for docker exec usage
RUN npm install -g @google/gemini-cli @vibe-kit/grok-cli @anthropic-ai/claude-code \
  && npm install -g @kaitranntt/ccs --force --ignore-scripts \
  && npm cache clean --force \
  && su -s /bin/bash node -c 'curl -fsSL https://opencode.ai/install | bash -s -- --no-modify-path' \
  && ln -sf /app/dist/ccs.js /usr/local/bin/ccs

ENV CCS_PORT=3000
EXPOSE 3000 8317

ENTRYPOINT ["/usr/local/bin/ccs-entrypoint"]

CMD ["bash", "-c", "node dist/ccs.js config --port ${CCS_PORT}"]
