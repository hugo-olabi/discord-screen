/**
 * Reprodução do áudio que vem junto com a tela.
 *
 * Cada pacote Opus chega, é decodificado e agendado no AudioContext logo depois
 * do anterior. Áudio não perdoa buraco: ao contrário do vídeo, onde um quadro
 * perdido passa despercebido, um intervalo sem amostra é um estalo audível.
 * Por isso existe um colchão — o som toca alguns milissegundos atrás do vivo,
 * e é essa folga que absorve o solavanco da rede.
 *
 * Sem AudioWorklet de propósito. Ele daria precisão por amostra, mas exige um
 * arquivo carregado por URL, e dentro do iframe da Activity toda URL passa pelo
 * proxy do Discord — um caminho a mais para dar errado, em troca de uma
 * precisão que pacotes de 20 ms não pedem.
 *
 * ponytail: agendamento por AudioBufferSourceNode. Se aparecer estalo com rede
 * ruim, o passo seguinte é um AudioWorklet com ring buffer.
 */

// Colchão contra o solavanco da rede. Abaixo disso qualquer atraso vira
// silêncio audível; muito acima, o som descola visivelmente da imagem.
const COLCHAO = 0.08;

// Teto do atraso acumulado. Quando a fila passa disso, o som já não acompanha
// a tela e continuar empilhando só piora — melhor um corte e voltar ao vivo.
const ATRASO_MAXIMO = COLCHAO * 4;

export function createAudio({ onError, volume = 1 } = {}) {
  let ctx = null;
  let decoder = null;
  let ganho = null;
  let proximo = 0;
  let nivel = volume;
  let tocou = false;
  let lastConfig = null;

  function start(config) {
    stop();

    if (!window.AudioDecoder || !window.AudioContext) {
      onError?.('Este navegador não toca o áudio da transmissão.');
      return false;
    }

    lastConfig = config;
    ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: config.sampleRate });
    ganho = ctx.createGain();
    ganho.gain.value = nivel;
    ganho.connect(ctx.destination);

    decoder = new AudioDecoder({
      output: agendar,
      error: (err) => {
        console.warn('[audio]', err.message);
        try {
          if (decoder && decoder.state === 'closed' && lastConfig) {
            decoder = new AudioDecoder({ output: agendar, error: () => {} });
            decoder.configure({
              codec: lastConfig.codec,
              sampleRate: lastConfig.sampleRate,
              numberOfChannels: lastConfig.numberOfChannels,
            });
          }
        } catch {
          /* ignorar */
        }
      },
    });

    try {
      decoder.configure({
        codec: config.codec,
        sampleRate: config.sampleRate,
        numberOfChannels: config.numberOfChannels,
      });
    } catch {
      onError?.(`Áudio em formato não suportado: ${config.codec}`);
      decoder = null;
      return false;
    }

    proximo = 0;
    tocou = false;
    return true;
  }

  /** Pacote empacotado: [1B slot][1B tipo][8B timestamp][8B envio][payload] */
  function push(buffer) {
    if (!decoder) return;

    if (decoder.state === 'closed' && lastConfig) {
      try {
        decoder = new AudioDecoder({ output: agendar, error: () => {} });
        decoder.configure({
          codec: lastConfig.codec,
          sampleRate: lastConfig.sampleRate,
          numberOfChannels: lastConfig.numberOfChannels,
        });
      } catch {
        return;
      }
    }

    if (decoder.state !== 'configured') return;

    const view = new DataView(buffer);
    const ts = view.getFloat64(2);
    try {
      decoder.decode(
        new EncodedAudioChunk({
          type: 'key', // Todo pacote Opus se decodifica sozinho.
          timestamp: Math.max(0, Math.round(ts)),
          data: new Uint8Array(buffer, 18),
        }),
      );
    } catch (err) {
      console.warn('[audio decode]', err.message);
    }
  }

  function agendar(dados) {
    if (!ctx) return dados.close();

    const canais = dados.numberOfChannels;
    const buffer = ctx.createBuffer(canais, dados.numberOfFrames, dados.sampleRate);
    for (let c = 0; c < canais; c++) {
      dados.copyTo(buffer.getChannelData(c), { planeIndex: c, format: 'f32-planar' });
    }
    dados.close();

    const agora = ctx.currentTime;

    // Fila secou (a rede engasgou): recomeça do presente.
    if (proximo < agora + 0.005) proximo = agora + COLCHAO;
    // Fila cresceu demais: atraso acumulado não se recupera sozinho.
    else if (proximo - agora > ATRASO_MAXIMO) proximo = agora + COLCHAO;

    const fonte = ctx.createBufferSource();
    fonte.buffer = buffer;
    fonte.connect(ganho);
    fonte.onended = () => {
      try {
        fonte.disconnect();
      } catch {
        /* noop */
      }
    };
    fonte.start(proximo);
    proximo += buffer.duration;
    tocou = true;

    if (ctx.state === 'suspended' && !resumeAttempted) {
      resumeAttempted = true;
      ctx.resume().then(() => {
        resumeAttempted = false;
      }).catch(() => {});
    }
  }

  let resumeAttempted = false;

  function unlockAudioOnGesture() {
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(() => {
        resumeAttempted = false;
      }).catch(() => {});
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('click', unlockAudioOnGesture, { capture: true });
    window.addEventListener('keydown', unlockAudioOnGesture, { capture: true });
    window.addEventListener('touchstart', unlockAudioOnGesture, { capture: true });
  }

  /**
   * @param {number} valor 0 a 2. Zero é o mudo — não existe estado separado, e
   * acima de 1 amplifica, para socorrer quem capturou o som muito baixo.
   */
  function setVolume(valor) {
    nivel = Math.min(2, Math.max(0, valor));
    // Rampa curta em vez de salto: mudar o ganho de um instante para o outro
    // produz um clique audível, que é justamente o que se quer evitar.
    if (ganho) ganho.gain.setTargetAtTime(nivel, ganho.context.currentTime, 0.02);
  }

  function stop() {
    if (decoder && decoder.state !== 'closed') {
      try {
        decoder.close();
      } catch {
        // Fechar o que já se fechou sozinho lança; não há nada a desfazer.
      }
    }
    decoder = null;

    ctx?.close().catch(() => {});
    ctx = null;
    ganho = null;
    proximo = 0;
    tocou = false;
  }

  return { start, push, stop, setVolume, temSom: () => tocou };
}
