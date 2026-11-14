#!/usr/bin/env python3
"""Monta o PhotoView num único arquivo HTML.

Uso:  python3 scripts/build.py
Gera:
  index.html                  -> página do GitHub Pages (raiz do repositório)
  dist/photoview-galeria.html -> arquivo para baixar e abrir offline
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def compact_json(path):
    data = json.loads(read(path))
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")


def build():
    html = read("src/photoview.html")
    parts = {
        "/*__LEAFLET_CSS__*/": read("vendor/leaflet.css") + "\n" + read("vendor/MarkerCluster.css"),
        "__MUNDO__": compact_json("data/mundo-50m.json"),
        "__CIDADES__": compact_json("data/cidades.json"),
        "__PAISES__": compact_json("data/paises-num.json"),
        "/*__APP__*/": read("src/app.js"),
    }
    for key, value in parts.items():
        assert html.count(key) == 1, f"marcador {key} não encontrado"
        html = html.replace(key, value)
    (ROOT / "dist").mkdir(exist_ok=True)
    for out in ("index.html", "dist/photoview-galeria.html"):
        (ROOT / out).write_text(html, encoding="utf-8")
    size = len(html.encode("utf-8")) / 1_048_576
    print(f"OK: index.html e dist/photoview-galeria.html ({size:.1f} MB)")


if __name__ == "__main__":
    build()
