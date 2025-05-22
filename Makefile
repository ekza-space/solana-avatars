anchor-deploy:
	anchor build && anchor deploy --program-name avatars --program-keypair target-deploy-keypair.json

anchor-deploy-minter:
	anchor build && anchor deploy --program-name minter --program-keypair target-deploy-keypair-minter.json

anchor-ted-devnet:
	anchor test --skip-build --skip-deploy

anchor-test-local:
	anchor test --provider.cluster localnet

anchor-test-dev:
	anchor test --provider.cluster devnet

ts-check:
	npx tsc --noEmit -p .

build-sdk:
	npx tsc --build sdk/tsconfig.json

build-sdk-2:
	yarn workspace avatars-sdk build

solana-set-devnet:
	solana config set --url https://api.devnet.solana.com

solana-set-testnet:
	solana config set --url http://127.0.0.1:8899