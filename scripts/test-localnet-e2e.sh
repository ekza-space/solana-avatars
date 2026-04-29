#!/usr/bin/env bash
set -euo pipefail

AVATARS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STELLAR_ROOT="$(cd "${AVATARS_ROOT}/../solana-stellar" && pwd)"
LEDGER_DIR="${AVATARS_ROOT}/.anchor/integration-ledger"
LOG_FILE="${AVATARS_ROOT}/.anchor/integration-validator.log"
RPC_URL="http://127.0.0.1:8899"
WALLET="${ANCHOR_WALLET:-${HOME}/.config/solana/id.json}"

cleanup() {
  if [[ -n "${VALIDATOR_PID:-}" ]] && kill -0 "${VALIDATOR_PID}" 2>/dev/null; then
    kill "${VALIDATOR_PID}" 2>/dev/null || true
    wait "${VALIDATOR_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

cd "${STELLAR_ROOT}"
anchor build

cd "${AVATARS_ROOT}"
anchor build

solana-test-validator \
  --reset \
  --ledger "${LEDGER_DIR}" \
  --bind-address 127.0.0.1 \
  --rpc-port 8899 \
  --faucet-port 9900 \
  --bpf-program 29KLLArkfCfRGPgTh4k4qzXvR2JkkXfRnnNZTKn54TKz target/deploy/minter.so \
  --bpf-program 56kfTdE1xmCkZ2eDuikD7S5Mr15nmdzQENDWfmdMVtt target/deploy/solana_avatars.so \
  --bpf-program 3rVXfq7LLSLqbDzvZuSrQoMytwczLj2Q8Hue62rxPZAA "${STELLAR_ROOT}/target/deploy/solana_stellar.so" \
  --clone-upgradeable-program metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s \
  --url mainnet-beta \
  >"${LOG_FILE}" 2>&1 &
VALIDATOR_PID=$!

for _ in {1..60}; do
  if solana cluster-version --url "${RPC_URL}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

solana cluster-version --url "${RPC_URL}" >/dev/null

ANCHOR_PROVIDER_URL="${RPC_URL}" ANCHOR_WALLET="${WALLET}" \
  yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts

cd "${STELLAR_ROOT}"
ANCHOR_PROVIDER_URL="${RPC_URL}" ANCHOR_WALLET="${WALLET}" \
  yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
