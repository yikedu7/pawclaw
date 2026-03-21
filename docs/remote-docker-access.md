# Remote Docker Access — Decision Report

**Decision: Use SSH tunneling over Docker TCP+TLS**

Addresses the implementation choice raised in issue #38 for establishing secure remote Docker access from the Railway backend to the Hetzner CX21 VPS.

---

## Background

The x-pet backend (running on Railway) needs to remotely manage Docker containers on a Hetzner CX21 VPS — spawning, stopping, and deleting one container per pet. Two options exist for this remote control channel: Docker TCP with TLS client authentication, or SSH tunneling.

Issue #38 originally recommended the TLS option. This document revises that recommendation to SSH after analyzing the failure modes of both approaches under hackathon time constraints.

---

## Option A: Docker TCP + TLS (original recommendation)

### How it works

Docker daemon is configured to listen on TCP port 2376 with mutual TLS. A CA is generated, which signs both a server certificate (installed on Hetzner) and a client certificate (stored as Railway environment variables). The backend connects via `dockerode` presenting the client cert.

```
Railway backend (dockerode)
        │
        │  TCP 2376 + mutual TLS
        ▼
Hetzner dockerd (listening on 0.0.0.0:2376)
```

**Hetzner `/etc/docker/daemon.json`:**
```json
{
  "hosts": ["unix:///var/run/docker.sock", "tcp://0.0.0.0:2376"],
  "tls": true,
  "tlscacert": "/etc/docker/ca.pem",
  "tlscert":   "/etc/docker/server-cert.pem",
  "tlskey":    "/etc/docker/server-key.pem",
  "tlsverify": true
}
```

**Railway backend connection:**
```typescript
const docker = new Docker({
  host: process.env.DOCKER_HOST,
  port: 2376,
  ca:   process.env.DOCKER_TLS_CA,
  cert: process.env.DOCKER_TLS_CERT,
  key:  process.env.DOCKER_TLS_KEY,
  protocol: 'https',
})
```

### Setup steps required

1. Generate CA key + self-signed CA cert (`openssl genrsa`, `openssl req`, `openssl x509`)
2. Generate server key + CSR, sign with CA, install on Hetzner
3. Generate client key + CSR, sign with CA, encode as PEM strings
4. Store `DOCKER_TLS_CA`, `DOCKER_TLS_CERT`, `DOCKER_TLS_KEY` in Railway env vars
5. Configure `daemon.json`, restart dockerd
6. Open port 2376 in Hetzner firewall

### Risks

| Risk | Severity | Notes |
|------|----------|-------|
| Certificate generation is error-prone | High | 10+ openssl commands; wrong `-extfile` flags or CN mismatch causes silent TLS handshake failures with no useful error message |
| Railway has no static egress IP | High | Cannot restrict port 2376 to Railway's IP in Hetzner firewall — must open to 0.0.0.0/0, leaving the Docker daemon world-accessible behind only the client cert |
| Client cert leakage = full VPS compromise | Critical | Anyone with the client cert PEM can run arbitrary containers on Hetzner |
| Certificate expiry | Medium | Self-signed certs have no auto-renewal; a forgotten expiry date kills all pets at demo time |
| Debugging TLS failures | High | `TLS handshake failed` does not indicate which cert is wrong, which field mismatches, or whether the port is even reachable |

### Maturity

Technically sound — Docker's official documentation describes this setup. However, the configuration burden and failure modes make it a poor fit for a time-constrained hackathon project.

---

## Option B: SSH Tunneling (recommended)

### How it works

The backend SSHes into Hetzner and forwards the Docker Unix socket over the encrypted SSH channel. `dockerode` natively supports this via its `ssh` protocol option — no port needs to be exposed.

```
Railway backend (dockerode ssh://)
        │
        │  TCP 22 (SSH, key auth)
        ▼
Hetzner sshd
        │
        │  unix:///var/run/docker.sock (local forwarding)
        ▼
Hetzner dockerd
```

**Railway backend connection:**
```typescript
import Docker from 'dockerode'

const docker = new Docker({
  protocol: 'ssh',
  host: process.env.HETZNER_HOST,       // e.g. "95.217.x.x"
  port: 22,
  username: process.env.HETZNER_USER,   // e.g. "root"
  sshOptions: {
    privateKey: process.env.HETZNER_SSH_KEY,  // PEM content, not a file path
  },
})
```

That is the entire connection setup. No certificates, no CA, no TLS configuration on the server side.

### Setup steps required

1. Generate an SSH keypair: `ssh-keygen -t ed25519 -f hetzner_deploy`
2. Add the public key to `/root/.ssh/authorized_keys` on Hetzner
3. Store the private key PEM as `HETZNER_SSH_KEY` in Railway env vars
4. Ensure dockerd listens on its default Unix socket (default behavior, no changes needed)
5. Hetzner firewall: only port 22 open (already required for server administration)

### Risks

| Risk | Severity | Notes |
|------|----------|-------|
| SSH private key leakage | Medium | Gives SSH access to the VPS, but not Docker-specific. Standard key rotation mitigates this. Same threat model as any cloud server |
| Per-call SSH connection overhead | Low | Each dockerode call opens an SSH connection (~100ms). Acceptable for container lifecycle management (create/stop/delete), which is not latency-sensitive |
| `ssh2` dependency in dockerode | Low | dockerode's SSH mode depends on the `ssh2` npm package. Well-maintained, widely used |
| Key rotation requires env var update | Low | Must redeploy Railway service to rotate the key. Acceptable for a hackathon |

### Why SSH has fewer failure modes

- **Setup errors are caught immediately.** If the private key is wrong or the public key isn't in `authorized_keys`, you get `Authentication failed` — a clear, actionable error.
- **No exposed port.** Port 2376 never opens. The attack surface is identical to any SSH-managed server.
- **No certificate lifecycle.** SSH keys do not expire.
- **Debugging is standard.** Any SSH connectivity issue can be reproduced with `ssh -i hetzner_deploy root@<ip>` from a local machine, independently of the Node.js code.

---

## Comparison

| Criterion | TLS (Option A) | SSH (Option B) |
|-----------|---------------|----------------|
| Setup time | 45–90 min (cert generation) | 10–15 min |
| Exposed ports | 2376 (world-accessible) | 22 only (already open) |
| Secret type | 3 PEM files (CA, cert, key) | 1 private key |
| Error messages when misconfigured | Opaque (`TLS handshake failed`) | Clear (`Authentication failed`) |
| Expiry concern | Yes (cert validity period) | No |
| Railway static IP required | Yes (for IP allowlist) | No |
| dockerode support | Native | Native |
| Demo-day failure risk | High (config surface) | Low |

---

## Decision

**Use SSH tunneling (Option B).**

For an MVP hackathon project with 2 pre-seeded demo pets, the configuration simplicity and debuggability of SSH outweigh any theoretical advantages of TLS. The security properties are equivalent for this use case: both approaches protect the Docker socket behind a cryptographic secret stored in Railway environment variables.

---

## Required changes

### Issue #38 update

Replace the "Option A: Docker TCP with TLS (recommended)" label with SSH as the recommended approach. The task list in #38 becomes:

1. Provision Hetzner CX21
2. Install Docker, create `/data/pets/`
3. Generate `ed25519` keypair, install public key on Hetzner
4. Add `HETZNER_HOST`, `HETZNER_USER`, `HETZNER_SSH_KEY` to Railway env vars
5. Open port 22 in Hetzner firewall (22 only; 2376 not needed)
6. Update `.env.example`

### Environment variables (updated)

Remove the three TLS vars. Replace with:

| Variable | Value |
|----------|-------|
| `HETZNER_HOST` | VPS IP address |
| `HETZNER_USER` | `root` (or dedicated deploy user) |
| `HETZNER_SSH_KEY` | ed25519 private key PEM content |

The `DOCKER_HOST`, `DOCKER_TLS_CERT`, `DOCKER_TLS_KEY`, `DOCKER_TLS_CA` vars documented in the original #38 spec are no longer needed.

### container-design.md update

The connection snippet in the DB tracking section should reference the SSH-based `docker` client instance rather than a TLS-configured one.

---

## References

- dockerode SSH protocol support: https://github.com/apocas/dockerode#ssh
- Docker daemon TLS docs (for reference only): https://docs.docker.com/engine/security/protect-access/
- Issue #38: Hetzner CX21 provisioning + Docker daemon remote access
- Issue #44: Container design decisions (container-design.md)
