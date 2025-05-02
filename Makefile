anchor-deploy:
	anchor build && anchor deploy --program-name solana-avatars --program-keypair target-deploy-keypair.json


ts-check:
	npx tsc --noEmit -p .

build-sdk:
	npx tsc --build sdk/tsconfig.json

build-sdk-2:
	yarn workspace solana-avatars-sdk build

solana-set-devnet:
	solana config set --url https://api.devnet.solana.com

solana-set-testnet:
	solana config set --url http://127.0.0.1:8899