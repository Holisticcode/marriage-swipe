FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY migrations ./migrations
COPY src ./src
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","src/server.js"]
