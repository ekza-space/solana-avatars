FROM node:22.15-alpine3.20

WORKDIR /app

# RUN apk add --no-cache python3 make g++ linux-headers eudev-dev libusb-dev

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --legacy-peer-deps

COPY build/ ./build
COPY .env .env
COPY id.json id.json

EXPOSE 3000

CMD ["npx", "remix-serve", "build/server/index.js", "--port", "3000"]