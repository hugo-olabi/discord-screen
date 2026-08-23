![StreamRoom Banner](streamroom-banner.png)

# StreamRoom

Compartilhamento e transmissão de tela e áudio de alta performance via WebCodecs & WebRTC/WebSocket.

O StreamRoom permite criar salas virtuais para assistir a transmissões em tempo real com ultra-baixa latência, utilizando aceleração por hardware (FFmpeg/WebCodecs) e sinalização via Supabase.

---

## 🚀 Como Usar

### 1. Requisitos
- **Node.js**: Versão 22 ou superior (para a interface web).
- **FFmpeg**: Necessário apenas para o transmissor nativo no computador que vai transmitir.

### 2. Instalação de Dependências
```bash
npm install
```

---

## 🛠️ Comandos Principais

| Comando | Descrição |
|---|---|
| `npm run dev` | Inicia o servidor de desenvolvimento web (Vite) para a interface do cliente. |
| `npm run build` | Compila a aplicação cliente para produção (gera os estáticos em `dist/`). |
| `npm run stream` | Executa o transmissor nativo (Python GTK4 / CLI) para transmissão de tela e áudio com baixa latência. |
| `npm run update-discord` | Atualiza o mapeamento de URL de atividades no Discord Developer Portal (opcional). |
| `npm test` | Executa a suíte de testes unitários (Vitest). |
| `npm run lint` | Executa a verificação de linter de código (ESLint). |

---

## 🖥️ Transmissão Nativa (Python Native Streamer)

Para transmitir com alta taxa de quadros (60 FPS) e resolução elevada sem sobrecarregar o navegador, utilize o transmissor nativo:

```bash
npm run stream
```

### Opções do Native Streamer:
- Interface gráfica GTK4 para seleção de janelas/telas e fontes de áudio.
- Suporte a aceleração por GPU (`NVENC`, `VAAPI`, `QSV`).
- Suporte a transmissão de áudio do sistema via PipeWire / PulseAudio.
- Túnel Cloudflare embutido para entrega direta de vídeo via WebSocket/WebCodecs.

---

## 📖 Documentação Adicional
- [como-funciona.md](docs/como-funciona.md): Explicação técnica sobre a arquitetura WebCodecs, Supabase e WebRTC.
- [vps.md](docs/vps.md): Guia para hospedagem estática em VPS ou servidor web.
