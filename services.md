# OSA Services Setup

## Service Files

| Service | File |
|----------|------|
| Cloudflare Tunnel | /etc/systemd/system/cloudflared.service |
| Frontend | /etc/systemd/system/osa-frontend.service |
| Analytics Backend | /etc/systemd/system/osa-analytics-backend.service |
| DW Backend | /etc/systemd/system/osa-dw-backend.service |
| ETL Backend | /etc/systemd/system/osa-etl-backend.service |

---

## Frontend Service

Path:
`/home/osa/apps/OSA/new/OSA/frontend`

Command:
```bash
npm run dev
```

Service:
```ini
[Unit]
Description=OSA Frontend
After=network.target

[Service]
Type=simple
User=osa
WorkingDirectory=/home/osa/apps/OSA/new/OSA/frontend
ExecStart=/usr/bin/npm run dev
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

---

## Analytics Backend Service

Path:
`/home/osa/apps/OSA/new/OSA/Analytics-backend`

Command:
```bash
source venv/bin/activate
python3 -m uvicorn main:app --host 127.0.0.1 --port 8010
```

Service:
```ini
[Unit]
Description=OSA Analytics Backend
After=network.target

[Service]
Type=simple
User=osa
WorkingDirectory=/home/osa/apps/OSA/new/OSA/Analytics-backend
ExecStart=/bin/bash -c 'source venv/bin/activate && python3 -m uvicorn main:app --host 127.0.0.1 --port 8010'
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

---

## DW Backend Service

Path:
`/home/osa/apps/OSA/new/OSA/dw-backend`

Command:
```bash
source venv/bin/activate
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8004
```

Service:
```ini
[Unit]
Description=OSA DW Backend
After=network.target

[Service]
Type=simple
User=osa
WorkingDirectory=/home/osa/apps/OSA/new/OSA/dw-backend
ExecStart=/bin/bash -c 'source venv/bin/activate && python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8004'
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

---

## ETL Backend Service

Path:
`/home/osa/apps/OSA/new/OSA/ETL-backend`

Command:
```bash
source venv/bin/activate
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8111
```

Service:
```ini
[Unit]
Description=OSA ETL Backend
After=network.target

[Service]
Type=simple
User=osa
WorkingDirectory=/home/osa/apps/OSA/new/OSA/ETL-backend
ExecStart=/bin/bash -c 'source venv/bin/activate && python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8111'
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

---

## Cloudflare Tunnel Service

Config:
`/etc/cloudflared/config.yml`

Command:
```bash
cloudflared tunnel run osa-main
```

Service:
```ini
[Unit]
Description=Cloudflare Tunnel
After=network.target

[Service]
Type=simple
User=osa
ExecStart=/usr/bin/cloudflared tunnel --config /etc/cloudflared/config.yml run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

---

## Systemd Commands

Reload systemd:

```bash
sudo systemctl daemon-reload
```

Enable services:

```bash
sudo systemctl enable cloudflared
sudo systemctl enable osa-frontend
sudo systemctl enable osa-analytics-backend
sudo systemctl enable osa-dw-backend
sudo systemctl enable osa-etl-backend
```

Start services:

```bash
sudo systemctl start cloudflared
sudo systemctl start osa-frontend
sudo systemctl start osa-analytics-backend
sudo systemctl start osa-dw-backend
sudo systemctl start osa-etl-backend
```

Check status:

```bash
sudo systemctl status cloudflared
sudo systemctl status osa-frontend
sudo systemctl status osa-analytics-backend
sudo systemctl status osa-dw-backend
sudo systemctl status osa-etl-backend
```

View logs:

```bash
sudo journalctl -u cloudflared -f
sudo journalctl -u osa-frontend -f
sudo journalctl -u osa-analytics-backend -f
sudo journalctl -u osa-dw-backend -f
sudo journalctl -u osa-etl-backend -f
```

Restart services:

```bash
sudo systemctl restart cloudflared
sudo systemctl restart osa-frontend
sudo systemctl restart osa-analytics-backend
sudo systemctl restart osa-dw-backend
sudo systemctl restart osa-etl-backend
```