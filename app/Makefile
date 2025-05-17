ts-check:
	npx tsc --noEmit -p tsconfig.json

deploy:
	yarn build && scp -r ./build/* vds-amster:/var/www/avatar/html

docker-build:
	npm run build
	- docker image rm dkeep-ui 
	docker build --platform=linux/amd64 -t dkeep-ui .

docker-run:
	docker run --rm --platform=linux/amd64 -p 3000:3000 dkeep-ui

deploy: docker-build
	docker save dkeep-ui > dkeep-ui.tar
	scp dkeep-ui.tar vds-dreamkeepers:/root/docker_images
	ssh vds-dreamkeepers 'bash /root/docker_images/deploy-dkeeper.sh'

deploy-remote:
	ssh root@vds-dreamkeepers "bash -l -c 'cd /root/git/dkeeper-ui-remix && ./deploy.sh'"