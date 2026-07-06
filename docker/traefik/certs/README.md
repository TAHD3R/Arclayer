# Local HTTPS certificates

Traefik expects these ignored local files:

- `arclayer.localhost.pem`
- `arclayer.localhost-key.pem`

Preferred local-browser setup is `mkcert` with a trusted local CA:

```bash
mkcert -install
mkcert -cert-file docker/traefik/certs/arclayer.localhost.pem -key-file docker/traefik/certs/arclayer.localhost-key.pem arclayer.localhost '*.arclayer.localhost'
```

If `mkcert` is unavailable, generate a local CA and a CA-signed wildcard
certificate:

```bash
pnpm local:https-cert
```

The fallback script creates a local CA in this ignored directory and signs the
Traefik wildcard certificate with it. Trust `arclayer-local-ca.pem` in your OS
or browser root store to remove browser certificate warnings.

On Windows, from WSL:

```bash
certutil.exe -user -addstore -f Root "$(wslpath -w docker/traefik/certs/arclayer-local-ca.pem)"
```

On Linux/WSL system trust:

```bash
sudo install -m 0644 docker/traefik/certs/arclayer-local-ca.pem /usr/local/share/ca-certificates/arclayer-local-dev-ca.crt
sudo update-ca-certificates
```

For Chrome/Chromium profiles that use NSS (`certutil` is provided by
`libnss3-tools` on Ubuntu):

```bash
mkdir -p "$HOME/.pki/nssdb"
certutil -d sql:"$HOME/.pki/nssdb" -A -t "C,," -n "Arclayer Local Dev CA" -i docker/traefik/certs/arclayer-local-ca.pem
```
