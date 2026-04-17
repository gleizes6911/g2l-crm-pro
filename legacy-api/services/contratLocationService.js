const PDFDocument = require('pdfkit');

/**
 * Service de génération de contrats de location de véhicules
 * Modèle EXACT D&J TRANSPORT
 */
class ContratLocationService {
  
  /**
   * Informations des sociétés du groupe
   */
  static SOCIETES = {
    'D & J transport': {
      nom: 'SARL D&J TRANSPORT',
      forme: 'Société à Responsabilité Limitée',
      capital: '70.000€',
      rcs: '794 531 137 RCS Perpignan',
      adresse: '16 Carrer de las Escales 66530 CLAIRA',
      siege: '16 Carrer de las Escales\n66530 CLAIRA'
    },
    'TPS TSMC EXPRESS': {
      nom: 'TPS TSMC EXPRESS',
      adresse: '4 RUE PIERRE BROSSOLETTE 66350 TOULOUGES',
      siren: '749 909 685 RCS PERPIGNAN',
      capital: '72.000 €',
      president: 'SALINAS AXEL'
    },
    'TSM COL': {
      nom: 'TSM COL',
      adresse: '66350 TOULOUGES',
      siren: 'RCS PERPIGNAN',
      capital: '10.000 €',
      president: ''
    },
    'TSM EXP': {
      nom: 'TSM EXP',
      adresse: '66350 TOULOUGES',
      siren: 'RCS PERPIGNAN',
      capital: '10.000 €',
      president: ''
    },
    'TSM LOG': {
      nom: 'TSM LOG',
      adresse: '66350 TOULOUGES',
      siren: 'RCS PERPIGNAN',
      capital: '10.000 €',
      president: ''
    },
    'TSM LOC': {
      nom: 'TSM LOC',
      adresse: '66350 TOULOUGES',
      siren: 'RCS PERPIGNAN',
      capital: '10.000 €',
      president: ''
    }
  };

  /**
   * Génère un contrat de location PDF - MODÈLE EXACT D&J
   */
  static async genererContrat(params) {
    const {
      loueur,
      locataire,
      immatriculation,
      typeVehicule,
      marque,
      modele,
      conducteurPrincipal,
      conducteurAutorise1,
      conducteurAutorise2,
      dateDebut,
      dateFin,
      prixMensuelHT,
      prixMensuelTTC,
      prixJournalierHT,
      prixJournalierTTC,
      accessoires,
      depotGarantie,
      assuranceOccupants,
      assuranceVolCollision,
      assurancePneusVitres,
      lieuSignature,
      dateSignature
    } = params;

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 40, bottom: 40, left: 50, right: 50 }
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Récupérer infos sociétés
        const infoLoueur = this.SOCIETES[loueur] || this.SOCIETES['D & J transport'];
        const infoLocataire = this.SOCIETES[locataire] || { nom: locataire, adresse: '', siren: '', capital: '', president: '' };

        // Calculer la durée
        const debut = new Date(dateDebut);
        const fin = new Date(dateFin);
        const diffMois = (fin.getFullYear() - debut.getFullYear()) * 12 + (fin.getMonth() - debut.getMonth());
        const dureeTexte = diffMois > 0 ? `${diffMois} mois` : `${Math.ceil((fin - debut) / (1000 * 60 * 60 * 24))} jours`;

        const formatDate = (dateStr) => {
          const d = new Date(dateStr);
          return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        };

        // ═══════════════════════════════════════════════════════════════════
        // PAGE 1
        // ═══════════════════════════════════════════════════════════════════
        
        // En-tête
        doc.fontSize(11).font('Helvetica-Bold');
        doc.text(infoLoueur.nom, 50, 40);
        
        doc.fontSize(9).font('Helvetica');
        doc.text(`${infoLoueur.forme} au capital de ${infoLoueur.capital}, ${infoLoueur.rcs},`, 50, 55);
        doc.text(infoLoueur.adresse, 50, 67);
        
        // Page 1/2 à droite
        doc.text('Page 1/2', 480, 40);
        
        // Siège social
        doc.text('Siège social : ' + infoLoueur.siege.split('\n')[0], 50, 85);
        doc.text(infoLoueur.siege.split('\n')[1] || '', 50, 97);

        // Titre
        doc.fontSize(14).font('Helvetica-Bold');
        doc.text('CONTRAT DE LOCATION', 0, 125, { align: 'center', width: 595 });
        doc.text('DE VEHICULE, EQUIPEMENTS ET ACCESSOIRES', 0, 142, { align: 'center', width: 595 });

        // Texte d'introduction
        doc.fontSize(9).font('Helvetica');
        const introText = `Le présent contrat de location (le « Contrat de Location ») vise à détailler les conditions particulières applicables à la location de véhicules automobiles et de leurs équipements et accessoires (la « Location ») par la société D&J TRANSPORT, société a responsabilité limitée immatriculée sous le numéro 794 531 137 RCS PERPIGNAN, à un tier, l'une de ses filiales, l'un de ses agents ou l'un de ses franchisés (le « Loueur »). Le Contrat de Location est complété par les conditions générales de location de la société D&J TRANSPORT – édition janvier 2018 – (les « CGL »). Le Contrat de Location forme avec les CGL un même ensemble contractuel régissant exclusivement les modalités juridiques associées à la Location et applicables dès la signature du présent Contrat de Location par le locataire (le « Client ») qui s'engage dès lors à les respecter et renonce à l'application de toute stipulation contraire, notamment au titre de ses propres conditions générales, le cas échéant.`;
        doc.text(introText, 50, 170, { width: 495, align: 'justify' });

        // Sous-titre "Contrat de Location"
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Contrat de Location', 50, 280);

        // ═══════════════════════════════════════════════════════════════════
        // TABLEAU PAGE 1
        // ═══════════════════════════════════════════════════════════════════
        const tableLeft = 50;
        const col1Width = 150;
        const col2Width = 345;
        const tableWidth = col1Width + col2Width;
        let tableY = 300;

        const drawTableRow = (label, value, rowHeight = 50) => {
          // Bordures
          doc.lineWidth(0.5);
          doc.rect(tableLeft, tableY, col1Width, rowHeight).stroke();
          doc.rect(tableLeft + col1Width, tableY, col2Width, rowHeight).stroke();
          
          // Label (colonne gauche)
          doc.fontSize(8).font('Helvetica');
          doc.text(label, tableLeft + 5, tableY + 5, { width: col1Width - 10 });
          
          // Valeur (colonne droite)
          doc.fontSize(9).font('Helvetica');
          doc.text(value || '', tableLeft + col1Width + 5, tableY + 5, { width: col2Width - 10 });
          
          tableY += rowHeight;
        };

        // Ligne 1 : Client
        let clientInfo = infoLocataire.nom + '\n';
        clientInfo += infoLocataire.adresse + '\n';
        clientInfo += `SIREN ${infoLocataire.siren}\n`;
        clientInfo += `CAPITAL SOCIAL ${infoLocataire.capital}`;
        if (infoLocataire.president) {
          clientInfo += `\nPRÉSIDENT : ${infoLocataire.president}`;
        }
        
        drawTableRow(
          'Nom, prénom, date de\nnaissance et adresse\ndu Client (ou s\'il s\'agit\nd\'une personne morale,\nforme sociale, capital social,\nnuméro d\'immatriculation au\nregistre du commerce et\ndes sociétés, siège social et\nnom du représentant légal)',
          clientInfo,
          85
        );

        // Ligne 2 : Conducteur principal
        let conducteurPrincipalText = '';
        if (conducteurPrincipal && conducteurPrincipal.nom) {
          conducteurPrincipalText = `${conducteurPrincipal.nom} ${conducteurPrincipal.prenom || ''}\n`;
          if (conducteurPrincipal.dateNaissance) conducteurPrincipalText += `Né(e) le ${conducteurPrincipal.dateNaissance}\n`;
          if (conducteurPrincipal.permis) {
            conducteurPrincipalText += `Permis n° ${conducteurPrincipal.permis.numero || ''}\n`;
            conducteurPrincipalText += `Délivré le ${conducteurPrincipal.permis.date || ''} à ${conducteurPrincipal.permis.lieu || ''}`;
          }
        }
        drawTableRow(
          'Désignation du\nconducteur principal\n(Nom, prénom, date de\nnaissance, date, lieu de\ndélivrance et numéro du\npermis de conduire)',
          conducteurPrincipalText,
          55
        );

        // Ligne 3 : Conducteur autorisé 1
        let conducteur1Text = '';
        if (conducteurAutorise1 && conducteurAutorise1.nom) {
          conducteur1Text = `${conducteurAutorise1.nom} ${conducteurAutorise1.prenom || ''}`;
        }
        drawTableRow(
          'Désignation d\'un\nConducteur Autorisé 1,\nle cas échéant\n(Nom, prénom, date de\nnaissance, date, lieu de\ndélivrance et numéro du\npermis de conduire)',
          conducteur1Text,
          55
        );

        // Ligne 4 : Conducteur autorisé 2
        let conducteur2Text = '';
        if (conducteurAutorise2 && conducteurAutorise2.nom) {
          conducteur2Text = `${conducteurAutorise2.nom} ${conducteurAutorise2.prenom || ''}`;
        }
        drawTableRow(
          'Désignation d\'un\nConducteur Autorisé 2,\nle cas échéant\n(Nom, prénom, date de\nnaissance, date, lieu de\ndélivrance et numéro du\npermis de conduire)',
          conducteur2Text,
          55
        );

        // Ligne 5 : Véhicule
        const vehiculeText = `${typeVehicule || 'VEHICULE'} ${immatriculation || ''}`;
        drawTableRow(
          'Immatriculation et\nCatégorie du véhicule\nloué',
          vehiculeText,
          35
        );

        // Ligne 6 : Accessoires
        drawTableRow('Accessoires optionnels', accessoires || 'NEANT', 25);

        // Pied de page 1
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text(infoLoueur.nom, 50, 770);

        // ═══════════════════════════════════════════════════════════════════
        // PAGE 2
        // ═══════════════════════════════════════════════════════════════════
        doc.addPage();

        // En-tête page 2
        doc.fontSize(11).font('Helvetica-Bold');
        doc.text(infoLoueur.nom, 50, 40);
        
        doc.fontSize(9).font('Helvetica');
        doc.text(`${infoLoueur.forme} au capital de ${infoLoueur.capital}, ${infoLoueur.rcs},`, 50, 55);
        doc.text(infoLoueur.adresse, 50, 67);
        
        doc.text('Page 2/2', 480, 40);

        // Tableau page 2
        tableY = 100;

        // Assurance occupants
        drawTableRow(
          'Souscription de\nl\'assurance Protection\noccupants accidents',
          assuranceOccupants || 'A CHARGE DU LOCATAIRE',
          35
        );

        // Assurance vol collision
        drawTableRow(
          'Souscription de la\nProtection vol et\ncollision',
          assuranceVolCollision || 'A CHARGE DU LOCATAIRE',
          35
        );

        // Assurance pneus vitres
        drawTableRow(
          'Souscription de la\nProtection pneus et\nvitres',
          assurancePneusVitres || 'A CHARGE DU LOCATAIRE',
          35
        );

        // Durée
        drawTableRow('Durée de la Location', dureeTexte, 25);

        // Dépôt de garantie
        drawTableRow('Dépôt de garantie', depotGarantie || 'NEANT', 25);

        // Date remise
        drawTableRow(
          'Date et heures de\nremise du véhicule',
          formatDate(dateDebut),
          30
        );

        // Date restitution
        drawTableRow(
          'Date et heures de\nrestitution du véhicule',
          formatDate(dateFin),
          30
        );

        // Prix
        let prixText = 'Prix du loyer principal [mensuel]\n';
        prixText += `HT : ${prixMensuelHT ? prixMensuelHT + ' €' : ''}\tTTC : ${prixMensuelTTC ? prixMensuelTTC + ' €' : ''}\n\n`;
        prixText += 'Complément de loyers optionnels [mensuel ou journalier] :\n';
        prixText += `HT : ${prixJournalierHT ? prixJournalierHT + ' €' : ''}\tTTC : ${prixJournalierTTC ? prixJournalierTTC + ' €' : ''}`;
        drawTableRow('Prix de la Location', prixText, 70);

        // Texte de signature
        doc.fontSize(9).font('Helvetica');
        const signatureText1 = 'La signature par le Client du présent Contrat de Location emporte acceptation sans réserve des conditions particulières de Location stipulées au présent Contrat de Location et des Conditions Générales de Location – édition janvier 2018 - du Loueur.';
        doc.text(signatureText1, 50, tableY + 15, { width: 495, align: 'justify' });

        doc.moveDown(0.5);
        const signatureText2 = 'Le Client reconnaît qu\'il a pris connaissance des CGL dont un exemplaire lui a été remis, de la grille tarifaire applicable ainsi que de la notice d\'assurance.';
        doc.text(signatureText2, { width: 495, align: 'justify' });

        // Fait à / Le
        doc.moveDown(1.5);
        doc.text(`Fait à ${lieuSignature || ''}`, 50);
        doc.text(`Le ${dateSignature ? formatDate(dateSignature) : ''}`);

        // Signature
        doc.moveDown(1.5);
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Le Locataire', 380);
        doc.font('Helvetica').fontSize(8);
        doc.text('Signature précédée de la mention « bon pour accord valant acceptation ».', 380);

        doc.end();

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Génère un nom de fichier pour le contrat
   */
  static genererNomFichier(immatriculation, dateDebut, dateFin) {
    const formatDate = (dateStr) => {
      const d = new Date(dateStr);
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
    };
    return `Contrat_location_${immatriculation}_du_${formatDate(dateDebut)}_au_${formatDate(dateFin)}.pdf`;
  }
}

module.exports = ContratLocationService;
