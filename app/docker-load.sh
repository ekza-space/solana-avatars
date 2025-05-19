#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAR="/root/docker_images/ekza-avatars.tar"
IMAGE_NAME="ekza-avatars"
CONTAINER_NAME="ekza-avatars"
NETWORK_MODE="host"
RESTART_POLICY="unless-stopped"

if [ ! -f "$IMAGE_TAR" ]; then
  echo "Error: Image file not found: $IMAGE_TAR" >&2
  exit 1
fi

echo "Loading Docker image..."
docker load -i "$IMAGE_TAR"

if docker ps -a --format '{{.Names}}' | grep -xq "$CONTAINER_NAME"; then
  echo "Removing existing container: $CONTAINER_NAME..."
  docker rm -f "$CONTAINER_NAME"
fi

if [ "$NETWORK_MODE" != "host" ]; then
  if ! docker network ls --format '{{.Name}}' | grep -xq "$NETWORK_MODE"; then
    echo "Creating network: $NETWORK_MODE..."
    docker network create "$NETWORK_MODE"
  fi
fi

echo "Starting container: $CONTAINER_NAME..."
docker run -d \
  --name "$CONTAINER_NAME" \
  --network "$NETWORK_MODE" \
  --restart "$RESTART_POLICY" \
  --env-file /root/git/avatars/app/.env \
  "$IMAGE_NAME"

echo "Deployment complete."