FROM node:24-bookworm-slim
WORKDIR /app
COPY services/mac-prototype/package*.json services/mac-prototype/
RUN npm ci --omit=dev --prefix services/mac-prototype && npm cache clean --force
COPY services/mac-prototype/*.mjs services/mac-prototype/
COPY services/scaffold/mock-jpki.mjs services/scaffold/mock-jpki.mjs
COPY services/cloud-prototype services/cloud-prototype/
RUN mkdir /data && chown node:node /data
USER node
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
EXPOSE 3000
CMD ["node","services/cloud-prototype/server.mjs"]
