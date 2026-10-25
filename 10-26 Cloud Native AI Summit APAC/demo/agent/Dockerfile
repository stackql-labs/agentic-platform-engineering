# Build runtime JavaScript in one stage; do not launch development-only tsx in production.
FROM node:24.19.0-slim AS build
WORKDIR /app
COPY ["10-26 Cloud Native AI Summit APAC/demo/agent/package.json", "./package.json"]
COPY ["10-26 Cloud Native AI Summit APAC/demo/agent/package-lock.json", "./package-lock.json"]
RUN npm ci --no-fund --no-audit
COPY ["10-26 Cloud Native AI Summit APAC/demo/agent/tsconfig.json", "./tsconfig.json"]
COPY ["10-26 Cloud Native AI Summit APAC/demo/agent/src", "./src"]
RUN npm run build

FROM node:24.19.0-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY ["10-26 Cloud Native AI Summit APAC/demo/agent/package.json", "./package.json"]
COPY ["10-26 Cloud Native AI Summit APAC/demo/agent/package-lock.json", "./package-lock.json"]
RUN npm ci --omit=dev --no-fund --no-audit && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY ["11-26 AI Engineer/workshop/scenarios/fixture.json", "./workshop/scenarios/fixture.json"]
COPY ["11-26 AI Engineer/workshop/scenarios/tracks.json", "./workshop/scenarios/tracks.json"]
ENV SCENARIO_PATH=/app/workshop/scenarios/fixture.json
ENV TRACK_SCENARIOS_PATH=/app/workshop/scenarios/tracks.json
USER node
CMD ["node", "dist/offline.js", "--offline"]
