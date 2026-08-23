# VPS Deployment Guide for StreamRoom

This guide explains how to host StreamRoom on a Virtual Private Server (VPS) to provide 24/7 web client availability.

---

## 1. Prerequisites
- **Ubuntu 22.04 / 24.04 LTS** (or Debian 12)
- **Node.js 22+**
- A domain name with an **A Record** pointing directly to your VPS IP address.

---

## 2. Install Node.js & Dependencies

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git caddy
node -v   # Must be v22.0.0 or higher
```

---

## 3. Clone Repository & Build Static Assets

```bash
sudo git clone https://github.com/hugo-olabi/discord-screen.git /opt/streamroom
cd /opt/streamroom
sudo npm ci
sudo npm run build
```

---

## 4. Reverse Proxy with Caddy

Edit `/etc/caddy/Caddyfile`:

```caddy
your-domain.com {
    root * /opt/streamroom/dist
    file_server
    try_files {path} /index.html
}
```

Reload Caddy:
```bash
sudo systemctl reload caddy
```

---

## 5. Discord Developer Portal Setup

In [Discord Developer Portal](https://discord.com/developers/applications):
- **Activities → URL Mappings**: Prefix `/`, Target `your-domain.com`
- **OAuth2 → Redirects**: `https://your-domain.com/auth/callback`
