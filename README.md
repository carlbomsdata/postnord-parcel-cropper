# postnord-parcel-cropper

En minimalistisk, statisk webbapp som beskär Traderas A4-fraktsedel från PostNord till en ren etikett på **104,4 × 187,8 mm**, redo för Zebra eller annan etikettskrivare.

**Live:** https://carlboms-data-ab.github.io/postnord-parcel-cropper/

## Funktioner

- All behandling sker lokalt i webbläsaren – PDF:en laddas aldrig upp till någon server.
- Text och streckkoder behålls som vektor-PDF via `pdf-lib` (görs inte om till en skärmbild).
- Enkel steg-för-steg-guide. Det du ser i förhandsvisningen är det som exporteras.
- Markeringen startar på beskärningsområdet för den aktuella Tradera/PostNord-mallen.

## Användning

Appen guidar dig i fyra steg:

1. **Ladda upp** – välj eller släpp PDF-filen från Tradera (endast första sidan behandlas).
2. **Rotera** – vrid etiketten rätt med **⟲ / ⟳**.
3. **Markera** – dra den blå rutan (eller handtagen / piltangenterna) innanför de prickade klippstrecken.
4. **Ladda ner** – hämta etiketten och skriv ut i **100 % / faktisk storlek** på **104,4 × 187,8 mm** med ”Anpassa till sida” avstängt.

## Köra lokalt

Servera mappen med valfri statisk server, t.ex.:

```bash
python3 -m http.server 8000
```

Öppna sedan `http://localhost:8000/`.

## Publicera med GitHub Pages

Aktiverat via **Settings → Pages → Deploy from a branch** (`main` / `/root`).

## Externa bibliotek

Laddas från CDN och körs i webbläsaren – PDF:en skickas aldrig till dessa tjänster:

- PDF.js 3.11.174
- pdf-lib 1.17.1

## Licens

GPL-3.0 – se [LICENSE](LICENSE).
