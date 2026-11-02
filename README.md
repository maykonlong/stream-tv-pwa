# Stream TV — webapp de TV (PWA) para GitHub Pages

App de streaming com cara de app de TV: menu lateral, hero, prateleiras, tela de detalhes,
player em tela cheia — tudo navegável por controle remoto, sem build step, servido como
arquivos estáticos (GitHub Pages / qualquer host estático).

```
tv-web/
├─ index.html            # shell
├─ app.js                # UI + motor de foco + player
├─ styles.css            # visual (vw-based, escala com a TV)
├─ catalog.json          # seu catálogo (edite aqui)
├─ manifest.webmanifest  # PWA (fullscreen, landscape)
├─ sw.js                 # service worker: shell offline
├─ icons/                # ícones 192/512/maskable
└─ demo/                 # clipe HLS local (30s) para testar o player sem CDN
```

## Rodar local

```bash
cd tv-web
python -m http.server 8765
# http://127.0.0.1:8765/
```

(Service worker só registra em https ou localhost; abrir via `file://` funciona para a UI,
mas sem cache offline.)

## Deploy no GitHub Pages

1. Crie o repo e suba **o conteúdo desta pasta na raiz**:

```bash
cd tv-web
git init -b main
git add .
git commit -m "feat: TV PWA"
git remote add origin https://github.com/<usuario>/<repo>.git
git push -u origin main
```

2. No GitHub: **Settings → Pages → Source: Deploy from a branch → main / (root)**.
   O `.nojekyll` incluso evita o Jekyll processar os arquivos.
3. Ou use o workflow incluso em `.github/workflows/pages.yml` (Settings → Pages → Source: GitHub Actions).

O app fica em `https://<usuario>.github.io/<repo>/` — todos os caminhos são relativos, então
funciona em subpasta sem mudar nada.

## Controles

| Ação | Teclado | Gamepad | TV (webOS/Tizen/Android TV) |
|---|---|---|---|
| Navegar | setas | D-pad / analógico | setas do controle |
| OK / abrir | Enter, Espaço | A | OK |
| Voltar | Esc, Backspace | B | Back (keyCode 461 / 10009) |
| Play/Pause no player | K, teclas de mídia | — | Play/Pause (179) |
| Avançar/voltar 10s | teclas de mídia | — | FF/REW (417/412) |

O motor de foco é espacial (não é ordem de DOM): escolhe o elemento mais próximo na direção
pressionada, com bônus para a mesma fileira, wrap-around no fim da fileira, memória de foco ao
fechar modais e scroll automático horizontal/vertical.

## Editar o catálogo

`catalog.json`:

```json
{
  "title": "STREAM",
  "hero": { "id":"h1", "title":"...", "description":"...", "video":"...m3u8 ou .mp4", "backdrop":"url opcional" },
  "rows": [
    { "id":"trending", "title":"Em alta", "type":"poster|wide",
      "items":[
        { "id":"x1", "title":"...", "meta":"2024 · 45 min", "video":"https://.../playlist.m3u8",
          "description":"...", "episodes":[{"id":"x1e1","title":"E1","video":"..."}] }
      ] }
  ]
}
```

- `video`: `.m3u8` (HLS, via hls.js) ou arquivo direto `.mp4`.
- `poster`/`backdrop` opcionais: sem imagem o card usa um gradiente determinístico pelo id.
- Episódios: se o item tiver `episodes`, a tela de detalhes lista episódios e o player ganha “próximo”.

## O que já está pronto

- Navegação por teclado/D-pad/gamepad (Gamepad API, polling com edge detection)
- Foco espacial + scroll automático das prateleiras
- Detalhes com retomar / do início / minha lista
- Player HLS + progresso salvo em `localStorage` → linha “Continuar assistindo”
- PWA: manifest fullscreen, ícones, service worker com shell offline (catálogo network-first)
- Layout responsivo (vertical em tablet/telefone)

## Limites

- PWA/estático não tem backend: nada de autenticação própria, proxy ou DRM. Só toca fontes que
  o navegador consegue tocar (HLS aberto, MP4).
- Widevine/DRM (Netflix, Prime, Disney+) não funciona em PWA próprio: a decriptação exige o CDM
  do navegador + licença do provedor. Não dá para “levar” o player de um app nativo para a web.
- Autoplay: alguns navegadores só liberam play com som depois de uma interação real do usuário
  (no controle remoto isso é o primeiro OK).
