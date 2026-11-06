Adapted from [Trovix/icarus](https://github.com/Trovix/icarus/tree/4439e321cc0d2b05019fc18f15eee069c2cdc620/src/connectors/http)
at commit `4439e321cc0d2b05019fc18f15eee069c2cdc620` (MIT).

ESPresso adds resource cleanup on all exit paths, explicit libcurl initialisation,
bounded response bodies, configurable timeouts and HTTPS-only redirects. Proxy
settings use libcurl's defaults rather than Icarus's machine-specific override.
