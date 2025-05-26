ts-check:
	npx tsc --noEmit -p tsconfig.json

deploy:
	yarn build && scp -r ./build/* vds-amster:/var/www/avatar/html

docker-build:
	npm run build && \
	docker image rm ekza-avatars || true && \
	docker build --platform=linux/amd64 -t ekza-avatars .

docker-run:
	docker rm -f ekza-avatars-container || true
	docker run -d --restart always --platform=linux/amd64 \
		--name ekza-avatars-container \
		-p 3000:3000 \
		ekza-avatars

deploy: docker-build
	docker save ekza-avatars > ekza-avatars.tar
	scp ekza-avatars.tar vds-amster:/root/docker_images
	ssh vds-amster 'bash /root/git/solana-avatars/app/scripts/deploy.sh'

deploy-remote:
	ssh root@vds-amster "bash -l -c 'cd /root/git/avatars && ./deploy.sh'"