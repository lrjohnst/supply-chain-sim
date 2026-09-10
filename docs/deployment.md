# Deployment — srv6

Sinds 2026-09-10 draait het spel op **https://supply-chain-sim.lucasjohnston.nl**.

Het is een puur client-side SPA: geen backend, geen database, geen `.env`. De hele game-state
leeft in de browser. Deployen is dus niets meer dan "bouwen en de `dist/` serveren".

## Waar het staat

| | |
|---|---|
| Repo op de server | `/var/www/supply-chain-sim.lucasjohnston.nl` (eigenaar `www-data:www-data`, mode 2775) |
| Document root | `/var/www/supply-chain-sim.lucasjohnston.nl/dist` |
| Nginx vhost | `/etc/nginx/sites-available/supply-chain-sim.lucasjohnston.nl` |
| Certificaat | Let's Encrypt, auto-renewal via Certbot |
| Logs | `/var/log/nginx/supply-chain-sim.{access,error}.log` |

De werkkopie op de server *is* de git-repo — er is geen aparte build-machine. `dist/` staat in
`.gitignore` en wordt op de server gegenereerd.

## Opnieuw bouwen na een wijziging

```bash
cd /var/www/supply-chain-sim.lucasjohnston.nl
sudo -u www-data git pull
sudo -u www-data npm ci          # alleen nodig als package-lock.json wijzigde
sudo -u www-data npx vite build
```

Nginx hoeft niet herladen te worden; het serveert de bestanden direct van schijf. De asset-namen
zijn gehasht en `index.html` wordt met `Cache-Control: no-cache` uitgeserveerd, dus een nieuwe
build is meteen zichtbaar zonder cache-gedoe.

## Waarom `npx vite build` en niet `npm run build`

`npm run build` is `tsc -b && vite build`, en die typecheck faalt momenteel met 40 fouten op `main`
(zie **BACKLOG.md**, item 1). `vite build` gebruikt esbuild, dat types wegstript zonder ze te
controleren — de bundle klopt, de typecheck is alleen nog niet schoon.

Zodra backlog-item 1 opgelost is kan hier gewoon weer `npm run build` staan, en is de typecheck
weer de poort die hij hoort te zijn. De build-opdracht in `package.json` is bewust ongewijzigd
gelaten, juist om die poort niet stilletjes weg te halen.

## Nginx-gedrag dat de moeite van het onthouden waard is

- **SPA-fallback**: `try_files $uri $uri/ /index.html`. Elk onbekend pad geeft de app terug in
  plaats van een 404, zodat client-side routing werkt bij een directe URL of een refresh.
- **`/assets/`** krijgt `expires 1y` + `immutable` — veilig, want Vite hasht die bestandsnamen.
- **`/index.html`** krijgt `no-cache`, anders blijft een oude build in de browser hangen en wijst
  die naar assets die na een rebuild niet meer bestaan.
- **gzip** staat aan voor css/js/svg. De bundle gaat daarmee van 739 kB naar ~217 kB.

## Node-versie

De server draait Node 22.23.1. `ReadmeClaude.md` noemt een pin op Vite 5 vanwege Node 20.16 op de
machine van de auteur; op srv6 is dat geen beperking, maar de pin is ongemoeid gelaten zodat beide
omgevingen dezelfde build produceren.
