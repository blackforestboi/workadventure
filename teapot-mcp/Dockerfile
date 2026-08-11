FROM node:24-bookworm-slim AS build

WORKDIR /build
COPY teapot-mcp/package.json ./package.json
COPY teapot-mcp/package-lock.json ./package-lock.json
RUN npm ci --ignore-scripts
COPY teapot-mcp/tsconfig.json ./tsconfig.json
COPY teapot-mcp/tsconfig.build.json ./tsconfig.build.json
COPY teapot-mcp/src ./src
RUN npm run build

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    TEAPOT_MCP_HOST=0.0.0.0 \
    TEAPOT_MCP_PORT=17374
WORKDIR /app
COPY teapot-mcp/package.json ./package.json
COPY teapot-mcp/package-lock.json ./package-lock.json
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /build/dist ./dist
USER node
EXPOSE 17374
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:17374/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
