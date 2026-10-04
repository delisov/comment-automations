FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/gateway-contract/package.json packages/gateway-contract/
COPY packages/api-schema/package.json packages/api-schema/
COPY packages/api/package.json packages/api/
COPY packages/stand/package.json packages/stand/
COPY packages/stand-web/package.json packages/stand-web/
RUN npm ci
COPY packages packages
RUN npx turbo run build --filter=@comment-automations/stand...

FROM node:22-alpine
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/gateway-contract/package.json packages/gateway-contract/
COPY packages/api-schema/package.json packages/api-schema/
COPY packages/api/package.json packages/api/
COPY packages/stand/package.json packages/stand/
COPY packages/stand-web/package.json packages/stand-web/
RUN npm ci --omit=dev
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/gateway-contract/dist packages/gateway-contract/dist
COPY --from=build /app/packages/stand/dist packages/stand/dist
COPY --from=build /app/packages/stand/public packages/stand/public
USER node
EXPOSE 3100
CMD ["node", "packages/stand/dist/server.js"]
