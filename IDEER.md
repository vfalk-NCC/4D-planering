# Idéer att ta upp senare

## Lättviktig 3D för iPhone/iPad (Victor 2026-10-10)

Mål: se hela modellerna i 3D-vyn på iPhone/iPad utan att Safari tar slut på minne (~1–1,5 GB per flik).

**Krav från Victor:** det får inte skapas något nytt i Trimble Connect varje gång man öppnar i mobilen –
de modeller som redan finns i TC ska användas på något sätt.

Förslag som diskuterats (inget byggt än):
- Kompaktare geometri i minnet: 16-bitars positioner per bit, komprimerade normaler, färg per objekt i
  stället för per hörn (ca 400–500 MB → 100–150 MB för en modell på 6,4 M trianglar).
- Instansering av likadana delar (profiler, plåtar, bultar) – stor vinst för stålmodeller.
- Träffar via en osynlig ID-bild (GPU) i stället för rumsligt index (BVH) – nästan inget minne.
- Egenskaper vid behov (bara för objektet man trycker på) i stället för att hålla hela IFC:n.
- Detaljnivå: små detaljer långt bort förenklas/döljs medan man snurrar.
- Öppen fråga: hur mobilen får geometrin utan att läsa hela IFC:n med web-ifc och utan nya filer i TC –
  t.ex. läsa IFC:n i delar/strömmande på telefonen och släppa minnet efter varje bit, eller använda TC:s
  egna visningsdata för modellen om de går att nå.
