#!/usr/bin/env bash
set -euo pipefail

cert_dir="docker/traefik/certs"
ca_key="${cert_dir}/arclayer-local-ca-key.pem"
ca_cert="${cert_dir}/arclayer-local-ca.pem"
server_key="${cert_dir}/arclayer.localhost-key.pem"
server_csr="${cert_dir}/arclayer.localhost.csr"
server_cert="${cert_dir}/arclayer.localhost.pem"
ca_serial="${cert_dir}/arclayer-local-ca.srl"

mkdir -p "${cert_dir}"

if [[ ! -f "${ca_key}" || ! -f "${ca_cert}" ]]; then
  openssl req \
    -x509 \
    -nodes \
    -newkey rsa:4096 \
    -sha256 \
    -days 3650 \
    -keyout "${ca_key}" \
    -out "${ca_cert}" \
    -config "${cert_dir}/openssl-ca.cnf" \
    -extensions v3_ca
fi

openssl req \
  -new \
  -nodes \
  -newkey rsa:2048 \
  -sha256 \
  -keyout "${server_key}" \
  -out "${server_csr}" \
  -config "${cert_dir}/openssl-san.cnf"

openssl x509 \
  -req \
  -in "${server_csr}" \
  -CA "${ca_cert}" \
  -CAkey "${ca_key}" \
  -CAcreateserial \
  -out "${server_cert}" \
  -days 825 \
  -sha256 \
  -extensions v3_req \
  -extfile "${cert_dir}/openssl-san.cnf"

rm -f "${server_csr}" "${ca_serial}"

echo "Generated ${server_cert}"
echo "Trust ${ca_cert} in your OS/browser root store."
