# PhotoView - Galeria

Galeria de fotos que roda 100% no navegador. Um único arquivo HTML, sem servidor.

## Estrutura
- `src/photoview.html`: HTML + CSS (tokens de cor em `:root`, tema claro/escuro). Marcadores substituídos no build: `/*__LEAFLET_CSS__*/`, `__MUNDO__`, `__CIDADES__`, `__PAISES__`, `/*__APP__*/`.
- `src/app.js`: lógica. Módulos por seção: leitura de arquivos (`readMedia`, `readMp4`), derivados (`derive`, `computeMoments`, `detectTrips`), linha do tempo (`renderTimeline`, `Scrub`), mapa (`GeoMap`, `MapView`, `MapCfg`, `Search`), viagem (`Trip`), `LB` (visualizador), `FS` (pastas lembradas).
- `data/cidades.json`: `[nome, país, uf, população, lat, lon, nomeOriginal?]`, em ordem de população. Gerado por `scripts/gerar-cidades.js`; traduções em `scripts/nomes-pt.json`.
- `scripts/build.py`: gera `index.html` (GitHub Pages) e `dist/PhotoView.html` (download).

## Regras
- Sempre rode `python3 scripts/build.py` depois de editar `src/`, e faça o commit do `index.html` gerado.
- Nunca alterar, mover ou apagar os arquivos do usuário. Só leitura.
- Nada de upload: nenhuma foto ou metadado sai do navegador.
- Interface e textos em português do Brasil, com linguagem simples (o público inclui pessoas leigas).
- Bibliotecas por CDN com versão fixa (jsDelivr/cdnjs). Dados grandes ficam embutidos no HTML.
- Preferências do usuário vão para `localStorage` com prefixo `pv-`; ajustes de data em `photoview-ajustes`.
