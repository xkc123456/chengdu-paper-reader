FROM node:20-alpine

WORKDIR /app

# 先只装依赖：源码改动时这一层可以复用缓存
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# 生产入口是 dist/server.js（应用本体在 api/boot.ts）
CMD ["node", "dist/server.js"]
