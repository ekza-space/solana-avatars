FROM node:23.11.0-bullseye

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps --omit=dev

COPY build/ ./build
COPY app/ ./app
COPY .env .env
COPY id.json id.json

EXPOSE 3000

CMD ["npm", "run", "start"]