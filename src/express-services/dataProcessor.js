/**
 * Service de traitement des données
 * Traite les données brutes pour les préparer à l'affichage
 */
class DataProcessor {
  /**
   * Traite les données brutes et les structure pour l'affichage
   * @param {Object} data - Données brutes à traiter
   * @returns {Object} Données traitées
   */
  static process(data) {
    try {
      // Si les données sont déjà structurées, les retourner telles quelles
      if (data && typeof data === 'object') {
        // Vérifier si les données ont déjà une structure attendue
        if (data.chauffeurs || data.vehicules || data.affectations || data.tournees) {
          return data;
        }
        
        // Sinon, retourner les données avec une structure minimale
        return {
          ...data,
          processed: true,
          timestamp: new Date().toISOString()
        };
      }
      
      // Si les données sont vides ou invalides, retourner un objet vide
      return {
        processed: true,
        timestamp: new Date().toISOString(),
        message: 'Aucune donnée à traiter'
      };
    } catch (error) {
      console.error('[DataProcessor] Erreur lors du traitement:', error);
      throw error;
    }
  }
}

module.exports = DataProcessor;







