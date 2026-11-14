# The Donovan web app on nginx: the built Angular app, a strict security policy, and /api proxied to the API with
# streaming left unbuffered. Build from the repository root: docker build -f apps/web/Dockerfile -t donovan-web .
# Runtime settings (environment): API_UPSTREAM (e.g. http://donovan-api:3870), OIDC_AUTHORITY (the issuer URL),
# OIDC_CLIENT_ID.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY vendor vendor
RUN npm ci --no-audit --no-fund -w @donovan/contracts -w web
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN npm run build -w @donovan/contracts && npm run build -w web

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=build /app/apps/web/dist/web/browser /usr/share/nginx/html
COPY deploy/web/nginx.conf.template /etc/nginx/donovan.conf.template
COPY --chmod=755 deploy/web/15-donovan.sh /docker-entrypoint.d/15-donovan.sh
USER root
# The start-up script writes config.json and the site into /tmp/donovan (see 15-donovan.sh); nginx reads the site
# through this link, so nothing outside /tmp is written and the root filesystem can be read-only.
RUN rm -f /usr/share/nginx/html/config.json /etc/nginx/conf.d/default.conf \
  && ln -s /tmp/donovan/site.conf /etc/nginx/conf.d/default.conf
USER 101
EXPOSE 8080
