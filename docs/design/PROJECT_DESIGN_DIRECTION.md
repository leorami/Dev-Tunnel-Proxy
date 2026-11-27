# Dev Tunnel Proxy — Project design direction

**Status:** Initial project identity, sourced from `engineer/devproxy-v215-release-frontend-20261127` and `status/global.css`. Review proposal only.

## Purpose
Dev Tunnel Proxy is development infrastructure. It makes many local services routable and inspectable without pretending they are one application. The status, health and reports surfaces are the human-facing part of that service.

## Visual language
- Light accent **#2D6CDF** is the light-theme `--accent` in `status/global.css`.
- Dark accent **#6AA6FF** is the dark-theme `--accent` in that stylesheet.
- Healthy, warning and error colors in the same file stay semantic and are not reused as the project accent.
- Accent decorates links and focus. Health is always named, never communicated by color alone.

## Typography and hierarchy
The status surface should answer what is up, what is routed and what needs a person, in that order. Technical detail remains available and secondary. Type stays compact and legible on both the light paper panels and the navy operations theme.

## Asset rights
No logo is invented and no raster is added. The identity is the existing blue signal on the status surface.

## Acceptance
Defined in this review source only. It does not change listeners, certificates, routes or deployment.
