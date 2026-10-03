FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api-schema/package.json packages/api-schema/
COPY packages/api/package.json packages/api/
RUN npm ci
COPY packages packages
RUN npm run build

FROM node:22-alpine
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api-schema/package.json packages/api-schema/
COPY packages/api/package.json packages/api/
RUN npm ci --omit=dev
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/api-schema/dist packages/api-schema/dist
COPY --from=build /app/packages/api/dist packages/api/dist
USER node
EXPOSE 3000
CMD ["node", "packages/api/dist/server.js"]
