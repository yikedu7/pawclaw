# OpenClaw container image — extends official OpenClaw runtime with onchainos CLI.
# Each pet runs one container of this image on the Hetzner host.
# See docs/architecture.md §"Route D: Docker per Pet".

FROM ghcr.io/openclaw/openclaw:latest

USER root

# Install curl + ca-certificates (needed for onchainos installer) then run install.sh
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -sSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# onchainos installs to /root/.local/bin — expose it for all users
RUN ln -sf /root/.local/bin/onchainos /usr/local/bin/onchainos

USER node

# OKX credentials are injected at container creation time via Env array.
# Never bake credentials into the image.
ENV HOME=/home/node
