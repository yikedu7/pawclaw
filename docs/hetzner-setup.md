# Hetzner CX21 Setup Guide

Manual steps to provision the Hetzner VPS that hosts all pet Docker containers, and wire it to the Railway backend via SSH tunneling.

Remote Docker access decision: **SSH tunneling** (see `docs/remote-docker-access.md` for the full rationale — TLS was rejected due to certificate complexity and Railway's lack of a static egress IP).

---

## Prerequisites

- Hetzner Cloud account
- Railway project with the backend service deployed
- `ssh-keygen` available locally

---

## Step 1 — Generate SSH keypair

Generate a dedicated ed25519 keypair for Railway → Hetzner access. Do not reuse your personal SSH key.

```bash
ssh-keygen -t ed25519 -f hetzner_deploy -C "pawclaw-railway-deploy" -N ""
# Creates: hetzner_deploy (private key) and hetzner_deploy.pub (public key)
```

Keep both files. You will need the private key content in Step 4.

---

## Step 2 — Create CX21 in Hetzner Cloud Console

1. Log in to [console.hetzner.cloud](https://console.hetzner.cloud)
2. Select your project (or create one named `pawclaw`)
3. Click **Add Server**
4. Configure:
   - **Location:** Any (Nuremberg or Helsinki are cheapest)
   - **Image:** Ubuntu 22.04
   - **Type:** CX21 (~$6/month, 2 vCPU, 4 GB RAM)
   - **SSH keys:** Upload `hetzner_deploy.pub` — paste contents of the file
   - **Name:** `pawclaw-prod`
5. Click **Create & Buy**
6. Note the server's **IPv4 address** — you'll need it in Step 4

---

## Step 3 — Run the provision script

SSH into the new server as root and run the provision script. Substitute your public key content:

```bash
# From your local machine
ssh root@<hetzner-ip> "DEPLOY_PUBKEY='$(cat hetzner_deploy.pub)' bash -s" < scripts/provision-hetzner.sh
```

The script is idempotent — safe to run multiple times. It will:
- Install Docker (Unix socket only, no TCP exposure)
- Create `/data/pets/` owned by uid 1000
- Configure UFW: allow ports 22 and 19000–19999 only
- Create a `deploy` user with your public key installed
- Add `deploy` to the `docker` group

Verify it worked:

```bash
ssh deploy@<hetzner-ip> "docker ps"
# Should print: CONTAINER ID   IMAGE   COMMAND   ...  (empty list is fine)
```

---

## Step 4 — Add environment variables to Railway

In the Railway dashboard, go to your **backend service → Variables** and add:

| Variable | Value |
|----------|-------|
| `HETZNER_HOST` | IPv4 address from Step 2 |
| `HETZNER_USER` | `deploy` |
| `HETZNER_SSH_KEY` | Full contents of `hetzner_deploy` (private key, including `-----BEGIN...` and `-----END...` lines) |
| `HETZNER_HOST_DATA_DIR` | `/data/pets` |

**How to copy the private key:**

```bash
cat hetzner_deploy
# Paste the entire output as the HETZNER_SSH_KEY value in Railway
```

After saving, Railway will redeploy the backend. The `dockerode` SSH client reads these vars at startup.

---

## Step 5 — Verify end-to-end connectivity

From a local machine (or Railway shell if available), run a quick connectivity test:

```bash
ssh -i hetzner_deploy deploy@<hetzner-ip> "docker info --format '{{.ServerVersion}}'"
# Expected: Docker version string, e.g. 27.3.1
```

If this succeeds, the Railway backend's `dockerode` SSH connection will work identically.

---

## Step 6 — Delete local keypair files

After storing the private key in Railway and the public key is on the server:

```bash
rm hetzner_deploy hetzner_deploy.pub
```

The private key lives only in Railway env vars. If you need to rotate it, generate a new pair, update Railway, and replace the authorized_keys entry on Hetzner.

---

## Firewall rules summary

| Port | Protocol | Purpose |
|------|----------|---------|
| 22 | TCP | SSH (server admin + Railway Docker SSH tunnel) |
| 19000–19999 | TCP | OpenClaw pet gateway ports (host → container 18789) |

Port 2376 (Docker TCP) is intentionally closed. All Docker management goes over SSH.

---

## Local testing with OrbStack

You can validate the provision script locally using [OrbStack](https://orbstack.dev/) before running on a real Hetzner server. OrbStack runs full Linux VMs with systemd, so `systemctl`, UFW, and Docker all work as on real hardware.

```bash
# Create a fresh Ubuntu 22.04 VM
orb create ubuntu:22.04 hetzner-test

# Run the provision script as root
orb run -m hetzner-test -u root bash < scripts/provision-hetzner.sh

# Verify results
orb run -m hetzner-test -u root stat -c '%u:%g %a' /data/pets    # expect: 1000:1000 755
orb run -m hetzner-test -u root ufw status                        # expect: 22, 19000:19999
orb run -m hetzner-test -u deploy docker ps                       # expect: empty table, no permission error

# Run again to verify idempotency (should skip all steps, no errors)
orb run -m hetzner-test -u root bash < scripts/provision-hetzner.sh
```

> **Keep the VM** — `hetzner-test` doubles as the local e2e test environment
> for container lifecycle tests (see `packages/backend/scripts/e2e-container.ts`).
> Stop it when not in use; start it again before running tests:
> ```bash
> orb stop hetzner-test   # when done
> orb start hetzner-test  # before next test run
> ```
> Pre-pull the OpenClaw image once so subsequent test runs are fast:
> ```bash
> ssh deploy@$(orb ip hetzner-test) "docker pull ghcr.io/openclaw/openclaw:latest"
> ```

---

## Troubleshooting

**SSH auth fails:**
```bash
ssh -vvv -i hetzner_deploy deploy@<hetzner-ip>
# Check: is the public key in /home/deploy/.ssh/authorized_keys?
```

**Docker permission denied:**
```bash
ssh deploy@<hetzner-ip> "groups"
# Expected: deploy adm ... docker ...
# If 'docker' missing: ssh root@<hetzner-ip> "usermod -aG docker deploy"
```

**Pet container unreachable on port 19000+N:**
```bash
ssh root@<hetzner-ip> "ufw status"
# Verify: 19000:19999/tcp ALLOW Anywhere
```
