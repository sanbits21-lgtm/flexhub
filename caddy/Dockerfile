# Caddy with a DNS-provider plugin, needed for ONE certificate covering *.yourdomain.com
# (Let's Encrypt only issues wildcards through a DNS challenge). Cloudflare by default;
# for another provider change DNS_PLUGIN (list: https://github.com/caddy-dns) and the
# `dns` line in Caddyfile.wildcard.
FROM caddy:2-builder AS build
ARG DNS_PLUGIN=github.com/caddy-dns/cloudflare
RUN xcaddy build --with ${DNS_PLUGIN}

FROM caddy:2-alpine
COPY --from=build /usr/bin/caddy /usr/bin/caddy
