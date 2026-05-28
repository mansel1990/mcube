# Kite order relay (DigitalOcean)

Runs on your DO droplet (`167.71.235.230`) so Kite API calls use the whitelisted static IP.

## Setup on droplet

```bash
sudo mkdir -p /opt/mcube-kite-relay
sudo chown $USER:$USER /opt/mcube-kite-relay
cd /opt/mcube-kite-relay

# Copy relay/ folder from repo (or git pull)
# package.json + server.mjs

npm install
```

Create `/opt/mcube-kite-relay/.env`:

```bash
KITE_API_KEY=your_api_key
KITE_RELAY_SECRET=long-random-string-same-as-vercel
PORT=3100
```

## systemd service

```ini
# /etc/systemd/system/mcube-kite-relay.service
[Unit]
Description=MCube Kite Order Relay
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/mcube-kite-relay
EnvironmentFile=/opt/mcube-kite-relay/.env
ExecStart=/usr/bin/node server.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable mcube-kite-relay
sudo systemctl start mcube-kite-relay
curl http://127.0.0.1:3100/health
```

## Firewall

Allow port 3100 only from Vercel (or use Caddy reverse proxy with HTTPS + secret header).

For initial testing, open 3100 temporarily or tunnel via SSH.

## Vercel env

```bash
KITE_RELAY_URL=http://167.71.235.230:3100
KITE_RELAY_SECRET=same-as-relay-.env
```

Upgrade to `https://relay.mcubetechstudio.com` when Caddy is configured.

## Endpoints

| Method | Path | Auth | Body |
|--------|------|------|------|
| GET | `/health` | none | — |
| POST | `/order` | `X-Relay-Secret` | `{ accessToken, symbol, transactionType, quantity, ... }` |
| POST | `/cancel` | `X-Relay-Secret` | `{ accessToken, orderId }` |

Market orders use `market_protection=-1` (required by Kite API).
