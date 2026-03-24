#!/usr/bin/env bash
# provision-hetzner.sh — Idempotent provisioning for Hetzner CX21 (Ubuntu 22.04)
#
# Usage:
#   ssh root@<hetzner-ip> 'bash -s' < scripts/provision-hetzner.sh
#   or copy to server and run: bash provision-hetzner.sh
#
# What this script does:
#   1. Installs Docker (if not already installed)
#   2. Creates /data/pets/ with correct ownership (uid 1000 = container user 'node')
#   3. Configures UFW firewall: allow SSH (22) + pet gateway ports (19000-19999)
#   4. Creates a 'deploy' user with SSH key auth only (no password login)
#   5. Adds 'deploy' to the docker group (Docker socket access without sudo)
#
# What this script does NOT do:
#   - Expose the Docker daemon over TCP (use SSH tunneling via HETZNER_SSH_KEY)
#   - Store any secrets on the server

set -euo pipefail

DEPLOY_USER="deploy"
PET_DATA_DIR="/data/pets"
# Paste the deploy user's public key here before running, or pass via env var:
# DEPLOY_PUBKEY="ssh-ed25519 AAAA... deploy@pawclaw"
DEPLOY_PUBKEY="${DEPLOY_PUBKEY:-}"

echo "==> [1/5] Installing Docker"
if command -v docker &>/dev/null; then
  echo "    Docker already installed: $(docker --version)"
else
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg lsb-release

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  systemctl enable docker
  systemctl start docker
  echo "    Docker installed: $(docker --version)"
fi

# Verify Docker daemon is using Unix socket only (no TCP exposure)
if grep -qsE '"tcp://' /etc/docker/daemon.json 2>/dev/null; then
  echo "ERROR: /etc/docker/daemon.json exposes Docker over TCP. Remove the tcp:// entry."
  exit 1
fi
echo "    Docker daemon socket: unix:///var/run/docker.sock (no TCP exposure confirmed)"

echo "==> [2/5] Creating $PET_DATA_DIR with correct permissions"
mkdir -p "$PET_DATA_DIR"
# Container 'node' user runs as uid 1000; host mount must be owned by 1000:1000
chown -R 1000:1000 "$PET_DATA_DIR"
chmod 755 "$PET_DATA_DIR"
echo "    $PET_DATA_DIR created, owner: $(stat -c '%U:%G' "$PET_DATA_DIR")"

echo "==> [3/5] Configuring UFW firewall"
if ! command -v ufw &>/dev/null; then
  apt-get install -y -qq ufw
fi

ufw --force reset
# Default: deny all incoming, allow all outgoing
ufw default deny incoming
ufw default allow outgoing

# SSH — required for server administration and Docker SSH tunneling
ufw allow 22/tcp comment "SSH"

# Pet gateway ports — one per OpenClaw container (host port maps to container port 18789)
# Ports 19000-19999 support up to 1000 concurrent pets
ufw allow 19000:19999/tcp comment "OpenClaw pet gateway ports"

# NOTE: Docker TCP port 2376 is intentionally NOT opened.
# Remote Docker access uses SSH tunneling (see docs/remote-docker-access.md).

ufw --force enable
echo "    UFW enabled. Active rules:"
ufw status numbered | grep -E "^(\[|Status)" | head -20

echo "==> [4/5] Creating deploy user"
if id "$DEPLOY_USER" &>/dev/null; then
  echo "    User '$DEPLOY_USER' already exists"
else
  useradd -m -s /bin/bash "$DEPLOY_USER"
  # Lock password login — SSH key only
  passwd -l "$DEPLOY_USER"
  echo "    User '$DEPLOY_USER' created (password login disabled)"
fi

# Install SSH public key if provided
if [ -n "$DEPLOY_PUBKEY" ]; then
  DEPLOY_HOME=$(eval echo "~$DEPLOY_USER")
  mkdir -p "$DEPLOY_HOME/.ssh"
  chmod 700 "$DEPLOY_HOME/.ssh"
  touch "$DEPLOY_HOME/.ssh/authorized_keys"
  chmod 600 "$DEPLOY_HOME/.ssh/authorized_keys"
  if grep -qsF "$DEPLOY_PUBKEY" "$DEPLOY_HOME/.ssh/authorized_keys"; then
    echo "    Public key already in authorized_keys"
  else
    echo "$DEPLOY_PUBKEY" >> "$DEPLOY_HOME/.ssh/authorized_keys"
    echo "    Public key installed to $DEPLOY_HOME/.ssh/authorized_keys"
  fi
  chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_HOME/.ssh"
else
  echo "    WARNING: DEPLOY_PUBKEY not set — install public key manually:"
  echo "    echo '<pubkey>' >> /home/$DEPLOY_USER/.ssh/authorized_keys"
fi

echo "==> [5/5] Adding deploy user to docker group"
if groups "$DEPLOY_USER" | grep -qw docker; then
  echo "    '$DEPLOY_USER' is already in the docker group"
else
  usermod -aG docker "$DEPLOY_USER"
  echo "    '$DEPLOY_USER' added to docker group"
fi

echo ""
echo "==> Provisioning complete."
echo ""
echo "Next steps:"
echo "  1. If you didn't set DEPLOY_PUBKEY above, install the public key:"
echo "     echo '<pubkey>' >> /home/$DEPLOY_USER/.ssh/authorized_keys"
echo "  2. Verify SSH access: ssh $DEPLOY_USER@<hetzner-ip>"
echo "  3. Add to Railway environment variables:"
echo "     HETZNER_HOST=<hetzner-ip>"
echo "     HETZNER_USER=$DEPLOY_USER"
echo "     HETZNER_SSH_KEY=<contents of ed25519 private key>"
echo "     HETZNER_HOST_DATA_DIR=$PET_DATA_DIR"
