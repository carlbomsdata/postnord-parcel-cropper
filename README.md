# Fraktsedelsklippare

En statisk GitHub Pages-app som beskär Traderas A4-fraktsedel från PostNord till en ren etikett på **102 × 192 mm**.

- All behandling sker lokalt i webbläsaren.
- PDF-filen laddas inte upp till någon server.
- Text och streckkoder behålls som PDF-innehåll via `pdf-lib`.
- Förhandsvisning och manuell beskärning görs med PDF.js.
- Ett förinställt beskärningsområde ligger innanför klippstrecken i den aktuella Tradera/PostNord-mallen.

## Publicera med GitHub Pages

1. Skapa ett nytt offentligt repository på GitHub, till exempel `fraktsedelsklippare`.
2. Ladda upp alla filer i denna mapp till repositoryts rot.
3. Öppna **Settings → Pages**.
4. Under **Build and deployment**, välj **Deploy from a branch**.
5. Välj `main` och `/ (root)`, och klicka **Save**.
6. Efter någon minut finns appen på:

   `https://DITT-ANVÄNDARNAMN.github.io/fraktsedelsklippare/`

## Användning

1. Välj PDF-filen från Tradera.
2. Klicka på **Tradera/PostNord-preset**.
3. Kontrollera att den blå rutan ligger innanför de prickade klippstrecken.
4. Justera vid behov genom att dra rutan eller handtagen.
5. Skapa och hämta PDF-filen.
6. Skriv ut i 100 % / faktisk storlek på 102 × 192 mm.

## Externa bibliotek

Appen laddar följande bibliotek från CDN:

- PDF.js 3.11.174
- pdf-lib 1.17.1

PDF-filen skickas inte till dessa tjänster. Biblioteken körs i webbläsaren och behandlar filen lokalt.
