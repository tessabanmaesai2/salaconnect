FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY . .
EXPOSE 3405
ENV PORT=3405
ENV NODE_ENV=production
CMD ["node", "server.cjs"]

