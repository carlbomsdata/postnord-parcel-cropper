# postnord-parcel-cropper

En statisk webbapp som beskär Traderas A4-fraktsedel från PostNord till en ren etikett på **102 × 192 mm**, redo för Zebra eller annan etikettskrivare.

**Live:** https://carlboms-data-ab.github.io/postnord-parcel-cropper/

## Funktioner

- All behandling sker lokalt i webbläsaren – PDF:en laddas aldrig upp till någon server.
- Text och streckkoder behålls som vektor-PDF via `pdf-lib` (görs inte om till en skärmbild).
- Förhandsvisning och manuell beskärning med PDF.js – dra rutan, dra i handtagen eller finjustera med piltangenterna.
- Preset som lägger beskärningsrutan innanför klippstrecken i den aktuella Tradera/PostNord-mallen.
- Justerbar utdatastorlek, rotering 180° och bibehållna proportioner (centrerad utan förvrängning).

## Användning

1. Öppna [appen](https://carlboms-data-ab.github.io/postnord-parcel-cropper/) och välj eller släpp PDF-filen från Tradera. Endast första sidan behandlas.
2. Klicka på **Tradera/PostNord-preset**.
3. Kontrollera att den blå rutan ligger innanför de prickade klippstrecken. Justera vid behov.
4. Klicka **Skapa PDF** och hämta filen.
5. Skriv ut i **100 % / faktisk storlek** på **102 × 192 mm** med ”Anpassa till sida” avstängt.

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
