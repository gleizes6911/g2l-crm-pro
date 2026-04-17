/**
 * Stub de NlpService pour permettre au serveur de démarrer.
 * Aucune vraie analyse NLP n'est faite pour le moment.
 */
class NlpService {
  static analyze(text) {
    console.log('[NlpService] Analyse texte (stub) :', text && text.slice(0, 80));
    return {
      keywords: [],
      sentiment: 'neutral'
    };
  }
}

module.exports = NlpService;
