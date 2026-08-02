# postnord-parcel-cropper

En statisk webbapp som beskär Traderas A4-fraktsedel från PostNord till en ren etikett på **104,4 × 187,8 mm**, redo för Zebra eller annan etikettskrivare.

**Live:** https://carlboms-data-ab.github.io/postnord-parcel-cropper/

## Funktioner

- All behandling sker lokalt i webbläsaren – PDF:en laddas aldrig upp till någon server.
- Text och streckkoder behålls som vektor-PDF via `pdf-lib` (görs inte om till en skärmbild).
- Allt görs i ett steg: **rotera** i 90°-steg och **markera** etiketten direkt i förhandsvisningen.
- Förhandsvisningen är WYSIWYG – det du ser efter rotation är exakt det som exporteras.
- Preset som vänder etiketten rätt och lägger rutan innanför klippstrecken i den aktuella Tradera/PostNord-mallen.

## Användning

1. Öppna [appen](https://carlboms-data-ab.github.io/postnord-parcel-cropper/) och välj eller släpp PDF-filen från Tradera. Endast första sidan behandlas.
2. Appen roterar och markerar automatiskt med presetet. Justera vid behov:
   - **⟲ Vänster / Höger ⟳** roterar i 90°-steg.
   - Dra den blå rutan eller handtagen, eller använd piltangenterna, så att den ligger innanför de prickade klippstrecken.
3. Klicka **Skapa PDF-etikett** och hämta filen.
4. Skriv ut i **100 % / faktisk storlek** på **104,4 × 187,8 mm** med ”Anpassa till sida” avstängt.

Storlek, proportioner och filnamn kan ändras under **Avancerat**.

## Köra lokalt

Servera mappen med valfri statisk server, t.ex.:

```bash
python3 -m http.server 8000
```

Öppna sedan `http://localhost:8000/`. (Ett `file://`-upplägg kan blockeras av webbläsarens säkerhetsregler för webbläsararbetare.)

## Publicera med GitHub Pages

Redan aktiverat för detta repo via **Settings → Pages → Deploy from a branch** (`main` / `/root`). För en egen fork:

1. Öppna **Settings → Pages**.
2. Under **Build and deployment**, välj **Deploy from a branch**.
3. Välj `main` och `/ (root)`, och klicka **Save**.

## Externa bibliotek

Laddas från CDN och körs i webbläsaren – PDF:en skickas aldrig till dessa tjänster:

- PDF.js 3.11.174
- pdf-lib 1.17.1

## Licens

GPL-3.0 – se [LICENSE](LICENSE).
