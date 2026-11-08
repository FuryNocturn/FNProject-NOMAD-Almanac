# NOMAD Almanac: sun and moon times, compass declination and tide predictions,
# served as a static site.
#
# Two stages: Node builds the Vite/React site (running the tests and the offline
# guard first, so a wrong sunrise or declination fails the build), then only the
# static files are copied into nginx. All data (the WMM2025 coefficients and the
# tide constants) is in the repo: the build downloads nothing but npm packages.
# No Node, no server code, no volumes at runtime; every computation runs in the
# browser and saved places live in each browser's localStorage.
# The site is the same on every CPU: build it (and run the tests) once, natively.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm test && npm run build

FROM nginx:1.28-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
