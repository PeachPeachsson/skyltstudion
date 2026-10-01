<p align="center">
  <img src="assets/logo.svg" alt="Jordnära" width="200">
</p>

# Jordnära Skyltstudion

Jordnäras interna skyltstudio – ett byggt webbverktyg för att skapa skyltar.

https://jordnara.se/skyltstudion/

## Innehåll

- `index.html` – startsida
- `assets/` – byggda JS/CSS-filer, typsnitt och grafik

## Format och skylttyper

- Prisskylt, Annonsvara, Budskap och Enkel text.
- Budskap: Cooper Black i rubriken, Cooper Medium i underrubriken och Roboto Regular i brödtexten. Textblocken placeras efter den faktiska texthöjden med korta, konsekventa mellanrum.
- A4, en A5 centrerad på A4, två A5 på liggande A4, A5 stående eller liggande på A5-papper, en A6 på A6-papper, fyra A6 på A4 och affischer 50 × 70 / 70 × 100 cm.
- Liggande A5 har rättvänd text och en egen horisontell komposition.
- Enkel text har en sammanhängande textyta, storlek i punkter och vänsterställd eller centrerad text. Storleken är gemensam för alla rader och behålls i utskrift. Om texten inte ryms spärras utskrift/PDF tills texten kortats eller storleken minskats.
- Alla format använder samma vektorunderlag för förhandsvisning, PDF och direktutskrift. Välj samma pappersformat i skrivaren och skriv ut i 100 %.
- Utkast och Mina skyltar sparas i webbläsaren. Skyltar kan även hämtas och öppnas som skyltfiler.

## För webbutvecklarna

Publicera `index.html`, `favicon.svg` och hela `assets/` tillsammans. Ingen serverkod eller installation krävs. Befintliga typsnitt och illustrationer ingår.

Detta repo innehåller den byggda appen, inte det ursprungliga kompletta källprojektet. De nya layoutfunktionerna finns läsbart i `assets/studio-updates.js` och anropas från appens befintliga renderare och React-gränssnitt i `assets/index-skyltstudion-v6.js`. `assets/message-layout.js` laddar typsnitten och hanterar Budskapets typografi. `assets/fixes-v6.css` innehåller gränssnittsjusteringarna. Det gamla DOM-tillägget `customer-update.js` är borttaget.

Vid framtida ombyggnad från ursprungskällan behöver motsvarande integration tas med. Återställ inte en äldre byggversion över dessa filer.

## Kontroll

Med Node.js installerat, kör från repots mapp:

```sh
node --experimental-vm-modules tests/layout-regression.cjs
```

Kontrollen kör den levererade renderaren och gränssnittets händelsehanterare. Den verifierar formatbyten, antal original, PDF-sidmått, ett utskriftsanrop per klick, sparade textinställningar och varning för text som inte ryms. Den öppnar ingen fysisk skrivardialog.
