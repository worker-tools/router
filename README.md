# @worker-tools/router
Placeholder for a future routing solutions that works in worker environments like Cloudflare Workers.

In the meantime, here are some alternatives:

- [Itty Router](https://github.com/kwhitley/itty-router).
  Appears to be the most worker-native router out there.

- [Tiny Request Router](https://github.com/berstend/tiny-request-router).
  Recommended. It might be a little too tiny for many usecases, but it is a good starting point.
  Fully typed!
  
- [Workbox Routing](https://developers.google.com/web/tools/workbox/modules/workbox-routing).
  A routing solution for Service Workers made by Google. I haven't tried to personally, but it shoud work in Cloudflare Workers as well.
