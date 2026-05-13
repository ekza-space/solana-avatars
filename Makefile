SHELL := /bin/bash

CLUSTER ?= localnet
ALLOW_MAINNET ?= 0
WALLET ?= $(HOME)/.config/solana/id.json

LOCALNET_URL ?= http://127.0.0.1:8899
DEVNET_URL ?= https://api.devnet.solana.com
MAINNET_URL ?= https://api.mainnet-beta.solana.com

ifeq ($(CLUSTER),localnet)
DEFAULT_RPC_URL := $(LOCALNET_URL)
ANCHOR_CLUSTER := localnet
else ifeq ($(CLUSTER),devnet)
DEFAULT_RPC_URL := $(DEVNET_URL)
ANCHOR_CLUSTER := devnet
else ifeq ($(CLUSTER),mainnet)
DEFAULT_RPC_URL := $(MAINNET_URL)
ANCHOR_CLUSTER := mainnet-beta
else ifeq ($(CLUSTER),mainnet-beta)
DEFAULT_RPC_URL := $(MAINNET_URL)
ANCHOR_CLUSTER := mainnet-beta
else
$(error CLUSTER must be localnet, devnet, mainnet, or mainnet-beta)
endif

RPC_URL ?= $(DEFAULT_RPC_URL)

.PHONY: help print-config check-mainnet build deploy deploy-localnet deploy-devnet deploy-mainnet \
	anchor-deploy anchor-deploy-minter anchor-test-devnet anchor-test-local ts-check \
	ts-check-tests build-sdk build-sdk-2 solana-set-devnet solana-set-testnet

help:
	@printf "%s\n" \
		"Solana Avatars Make targets" \
		"" \
		"Core:" \
		"  make build                         Build Anchor programs" \
		"  make deploy CLUSTER=localnet       Deploy avatars + minter to CLUSTER via RPC_URL" \
		"  make deploy-localnet               Deploy avatars + minter to localnet" \
		"  make deploy-devnet                 Deploy avatars + minter to devnet" \
		"  make deploy-mainnet ALLOW_MAINNET=1 Deploy avatars + minter to mainnet" \
		"" \
		"Compatibility:" \
		"  make anchor-deploy                 Build + deploy avatars program only" \
		"  make anchor-deploy-minter          Build + deploy minter program only" \
		"" \
		"Variables:" \
		"  CLUSTER=localnet|devnet|mainnet    Default: $(CLUSTER)" \
		"  RPC_URL=<custom rpc>               Default for cluster: $(DEFAULT_RPC_URL)" \
		"  WALLET=<keypair>                   Default: $(WALLET)"

print-config:
	@printf "CLUSTER=%s\nANCHOR_CLUSTER=%s\nRPC_URL=%s\nWALLET=%s\n" \
		"$(CLUSTER)" "$(ANCHOR_CLUSTER)" "$(RPC_URL)" "$(WALLET)"

check-mainnet:
	@if [[ "$(ANCHOR_CLUSTER)" == "mainnet-beta" && "$(ALLOW_MAINNET)" != "1" ]]; then \
		echo "Refusing mainnet deploy. Re-run with CLUSTER=mainnet ALLOW_MAINNET=1 after checking WALLET and RPC_URL."; \
		exit 1; \
	fi

build:
	anchor build

deploy: check-mainnet build
	anchor deploy --program-name minter --program-keypair target-deploy-keypair-minter.json --provider.cluster "$(RPC_URL)" --provider.wallet "$(WALLET)"
	anchor deploy --program-name avatars --program-keypair target-deploy-keypair.json --provider.cluster "$(RPC_URL)" --provider.wallet "$(WALLET)"

deploy-localnet:
	$(MAKE) CLUSTER=localnet deploy

deploy-devnet:
	$(MAKE) CLUSTER=devnet deploy

deploy-mainnet:
	$(MAKE) CLUSTER=mainnet deploy

anchor-deploy:
	$(MAKE) build
	anchor deploy --program-name avatars --program-keypair target-deploy-keypair.json --provider.cluster "$(RPC_URL)" --provider.wallet "$(WALLET)"

anchor-deploy-minter:
	$(MAKE) build
	anchor deploy --program-name minter --program-keypair target-deploy-keypair-minter.json --provider.cluster "$(RPC_URL)" --provider.wallet "$(WALLET)"

anchor-test-devnet:
	anchor test --skip-build --skip-deploy

anchor-test-local:
	anchor test --provider.cluster localnet

ts-check:
	npx tsc --noEmit -p .

ts-check-tests:
	npx tsc --noEmit tests/**/*.ts

build-sdk:
	npx tsc --build sdk/tsconfig.json

build-sdk-2:
	yarn workspace avatars-sdk build

solana-set-devnet:
	solana config set --url https://api.devnet.solana.com

solana-set-testnet:
	solana config set --url http://127.0.0.1:8899
