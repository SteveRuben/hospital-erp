FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN npx tsc

EXPOSE 5000

CMD ["node", "dist/index.js"]