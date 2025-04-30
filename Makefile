ts-check:
	npx tsc --noEmit -p .

build-sdk:
	npx tsc --build sdk/tsconfig.json

build-sdk-2:
	yarn workspace solana-avatars-sdk build