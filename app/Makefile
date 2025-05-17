ts-check:
	npx tsc --noEmit -p tsconfig.json

deploy:
	yarn build && scp -r ./build/* vds-amster:/var/www/avatar/html

docker-build:
	npm run build
	- docker image rm ekza-avatars 
	docker build --platform=linux/amd64 -t ekza-avatars .

docker-run:
	docker run -d --restart always --platform=linux/amd64 \
		-p 3000:3000 \
		--network host \
		ekza-avatars

deploy: docker-build
	docker save ekza-avatars > ekza-avatars.tar
	scp ekza-avatars.tar vds-dreamkeepers:/root/docker_images
	ssh vds-dreamkeepers 'bash /root/docker_images/deploy-dkeeper.sh'

deploy-remote:
	ssh root@vds-dreamkeepers "bash -l -c 'cd /root/git/dkeeper-ui-remix && ./deploy.sh'"