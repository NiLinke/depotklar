# Grundimage mit fester Version und Prüfsumme: Jeder Build nutzt genau dieses Image.
# Aktualisieren: beide Angaben ersetzen (Docker Hub, library/node, Tag 24.x.y-alpine3.y).
ARG NODE_IMAGE=node:24.22.2-alpine3.24@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8

# Build: Bibliotheken aus dem Lockfile, alle Tests, dann Excel- und PDF-Module nach dist/vendor.
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY scripts ./scripts
COPY dist ./dist
COPY tests ./tests
COPY public-docs ./public-docs
COPY *.md ./
COPY server.mjs Dockerfile compose.yaml ./
COPY .github ./.github
RUN npm test
RUN npm run build

# Laufzeit: nur ausgelieferte Dateien und der Server, keine Bibliotheken, kein Root.
FROM ${NODE_IMAGE}
# npm, yarn und corepack braucht der Server nicht: Ohne sie hat das Image weniger Angriffsfläche und ein
# Schwachstellen-Scanner meldet nicht die Abhängigkeiten der Paketverwaltung.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
LABEL org.opencontainers.image.title="Depotklar" \
      org.opencontainers.image.description="Wertpapierbestände wirtschaftlich und steuerlich fortschreiben – lokal verschlüsselt"
WORKDIR /app
# DEPOTKLAR_SITE=app liefert nur Anwendung und Handbuch (ohne Startseite, Impressum und Datenschutz).
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DEPOTKLAR_SITE=full
COPY --from=build /app/dist ./dist
COPY server.mjs package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
