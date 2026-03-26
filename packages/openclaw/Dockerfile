# OpenClaw container image — extends official OpenClaw runtime with onchainos CLI.
# Each pet runs one container of this image on the Hetzner host.
# See docs/architecture.md §"Route D: Docker per Pet".

FROM ghcr.io/openclaw/openclaw:latest

USER root

# Install onchainos v2.1.0 — v2.2+ requires glibc 2.39 but this image's base OS
# (Debian 12 bookworm) only provides glibc 2.36. v2.1.0 was compiled against
# glibc 2.34 and works on Debian 12.
# Re-evaluate when the base image is upgraded to Ubuntu 24.04 (glibc 2.39).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && mkdir -p /home/node/.local/bin \
    && curl -sSL "https://github.com/okx/onchainos-skills/releases/download/v2.1.0/onchainos-x86_64-unknown-linux-gnu" \
       -o /home/node/.local/bin/onchainos \
    && chmod +x /home/node/.local/bin/onchainos \
    && chown -R node:node /home/node/.local/bin \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

USER node

# OKX credentials are injected at container creation time via Env array.
# Never bake credentials into the image.
ENV HOME=/home/node
