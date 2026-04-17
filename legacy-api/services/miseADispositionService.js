const SalesforceService = require('./salesforceService');

class MiseADispositionService {
  constructor(sfService) {
    this.sfService = sfService;
  }

  /**
   * Récupère les courses pour une liste d'ODS (traitement par batch)
   */
  async recupererCourses(odsIds) {
    console.log('[Courses] ═══════════════════════════════════════════');
    console.log(`[Courses] Récupération des courses pour ${odsIds.length} ODS`);

    if (!odsIds || odsIds.length === 0) {
      console.log('[Courses] ⚠️ Aucun ODS fourni');
      return [];
    }

    if (!this.sfService.conn) {
      throw new Error('Non connecté à Salesforce');
    }

    // ═══════════════════════════════════════════════════════════
    // TRAITEMENT PAR BATCH POUR ÉVITER URI TOO LONG (414)
    // ═══════════════════════════════════════════════════════════
    const BATCH_SIZE = 200; // Maximum 200 ODS par requête
    const allCourses = [];
    const totalBatches = Math.ceil(odsIds.length / BATCH_SIZE);

    console.log(`[Courses] Traitement par batch de ${BATCH_SIZE} (${totalBatches} batches)`);

    for (let i = 0; i < odsIds.length; i += BATCH_SIZE) {
      const batch = odsIds.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

      try {
        // ═══════════════════════════════════════════════════════════
        // REQUÊTE SOQL AVEC LES BONS CHAMPS
        // ═══════════════════════════════════════════════════════════
        const query = `
          SELECT 
            Id,
            Name,
            IO_OrdreDeService__c,
            IO_Chargeur__c,
            IO_Chargeur__r.Name,
            IO_Tournee__c,
            IO_Tournee__r.Name,
            IO_Tournee__r.IO_Societe__c,
            IO_Tournee__r.IO_Societe__r.Name,
            IO_NombreDeColisPrisEnCharge__c
          FROM IO_Course__c
          WHERE IO_OrdreDeService__c IN ('${batch.join("','")}')
        `;

        console.log(`[Courses] Batch ${batchNumber}/${totalBatches} : requête ${batch.length} ODS...`);

        let result = await this.sfService.conn.query(query);

        if (result.records && result.records.length > 0) {
          allCourses.push(...result.records);
          console.log(`[Courses] Batch ${batchNumber}/${totalBatches} : ✅ ${result.records.length} courses récupérées`);

          // Pagination si nécessaire
          while (!result.done && result.nextRecordsUrl) {
            result = await this.sfService.conn.queryMore(result.nextRecordsUrl);
            allCourses.push(...result.records);
          }
        } else {
          console.log(`[Courses] Batch ${batchNumber}/${totalBatches} : ⚠️ 0 course`);
        }

      } catch (error) {
        console.error(`[Courses] Batch ${batchNumber}/${totalBatches} : ❌ ERREUR:`, error.message);

        if (error.message.includes('No such column')) {
          console.error('[Courses] 🚨 Champ Salesforce inexistant !');
          console.error('[Courses] Vérifie les noms de champs dans le Developer Console');
        }

        // Continuer avec les autres batches même en cas d'erreur
      }
    }

    console.log(`[Courses] ✅ Total récupéré : ${allCourses.length} courses`);

    // Debug : afficher la structure d'une course
    if (allCourses.length > 0) {
      console.log('[Courses] Structure première course (COMPLÈTE):');
      const first = allCourses[0];
      console.log(JSON.stringify(first, null, 2));
      console.log('[Courses] Clés disponibles:', Object.keys(first));
      console.log(`[Courses]   - ID: ${first.Id}`);
      console.log(`[Courses]   - Name: ${first.Name}`);
      console.log(`[Courses]   - IO_Chargeur__c: ${first.IO_Chargeur__c || 'N/A'}`);
      console.log(`[Courses]   - IO_Chargeur__r?.Name: ${first.IO_Chargeur__r?.Name || 'N/A'}`);
      console.log(`[Courses]   - IO_Tournee__c: ${first.IO_Tournee__c || 'N/A'}`);
      console.log(`[Courses]   - IO_Tournee__r?.IO_Societe__c: ${first.IO_Tournee__r?.IO_Societe__c || 'N/A'}`);
      console.log(`[Courses]   - IO_Tournee__r?.IO_Societe__r?.Name: ${first.IO_Tournee__r?.IO_Societe__r?.Name || 'N/A'}`);
      console.log(`[Courses]   - IO_NombreDeColisPrisEnCharge__c: ${first.IO_NombreDeColisPrisEnCharge__c || 0}`);
    } else {
      console.log('[Courses] ⚠️ AUCUNE COURSE RÉCUPÉRÉE !');
    }

    console.log('[Courses] ═══════════════════════════════════════════');

    return allCourses;
  }

  /**
   * Analyse les mises à disposition par nombre de colis
   */
  analyserMiseADisposition(ordresService, courses) {
    console.log('[MAD] Analyse détaillée des mises à disposition...');

    const resultats = {
      chauffeurs: [],
      vehicules: []
    };

    // ═══════════════════════════════════════════════════════════
    // GROUPER LES COURSES PAR ODS
    // ═══════════════════════════════════════════════════════════
    const coursesByOds = courses.reduce((acc, course) => {
      const odsId = course.IO_OrdreDeService__c;
      if (!acc[odsId]) {
        acc[odsId] = [];
      }
      acc[odsId].push(course);
      return acc;
    }, {});

    console.log(`[MAD] Courses groupées par ${Object.keys(coursesByOds).length} ODS`);

    let totalMadChauf = 0;
    let totalMadVeh = 0;

    // ═══════════════════════════════════════════════════════════
    // ANALYSER CHAQUE ODS
    // ═══════════════════════════════════════════════════════════
    ordresService.forEach((ods, index) => {
      const odsId = ods.Id;
      const chauffeur = ods.IO_Chauffeur__r?.Name;
      const employeur = ods.IO_Chauffeur__r?.Employeur__r?.Name || 'N/A';
      const vehicule = ods.IO_Vehicule__r?.Name;
      const porteuse = ods.IO_Vehicule__r?.Filiale_Porteuse_Contrat__r?.Name || 'N/A';
      const date = ods.IO_Date__c;

      // Récupérer les courses de cet ODS
      const coursesOds = coursesByOds[odsId] || [];

      if (coursesOds.length === 0) {
        // Pas de course = Le chauffeur a travaillé normalement pour son employeur
        // On ne crée pas d'entrée car pas de MAD
        return;
      }

      // ═══════════════════════════════════════════════════════════
      // CALCULER LE TOTAL DE COLIS POUR CET ODS (= CE JOUR)
      // ═══════════════════════════════════════════════════════════
      const totalColis = coursesOds.reduce((sum, c) =>
        sum + (c.IO_NombreDeColisPrisEnCharge__c || 0), 0
      );

      if (totalColis === 0) {
        console.warn(`[MAD] ⚠️ ODS ${ods.Name} : Total colis = 0, ignoré`);
        return;
      }

      if (index < 3) { // Log seulement les 3 premiers pour pas polluer
        console.log(`[MAD] ────────────────────────────────────────────`);
        console.log(`[MAD] ODS ${ods.Name} (${date})`);
        console.log(`[MAD]   Chauffeur : ${chauffeur} (${employeur})`);
        console.log(`[MAD]   Véhicule : ${vehicule} (${porteuse})`);
        console.log(`[MAD]   ${coursesOds.length} courses, ${totalColis} colis total`);
      }

        // ═══════════════════════════════════════════════════════════
        // AGRÉGER LES COURSES PAR BÉNÉFICIAIRE POUR CET ODS
        // (pour éviter de compter plusieurs fois le même jour)
        // ═══════════════════════════════════════════════════════════
        const coursesParBeneficiaire = {};
        
        coursesOds.forEach((course, courseIdx) => {
        // Debug pour les premières courses
        if (index < 2 && courseIdx === 0) {
          console.log(`[MAD] DEBUG Course structure (COMPLÈTE):`);
          console.log(JSON.stringify(course, null, 2));
          console.log(`[MAD] Clés disponibles:`, Object.keys(course));
        }
        
        // ═══════════════════════════════════════════════════════════
        // SOCIÉTÉ BÉNÉFICIAIRE = Société de la tournée (IO_Tournee__r.IO_Societe__r.Name)
        // ═══════════════════════════════════════════════════════════
        const societeBeneficiaire = course.IO_Tournee__r?.IO_Societe__r?.Name
          || course.IO_Tournee__r?.IO_Societe__c
          || 'N/A';
        
        // Essayer plusieurs façons d'accéder au nombre de colis
        const nbColis = course.IO_NombreDeColisPrisEnCharge__c 
          || course.IO_NombreColis__c
          || course.IO_NombreDeColis__c
          || 0;
        
        // Debug si société bénéficiaire = N/A
        if (societeBeneficiaire === 'N/A' && index < 2) {
          console.log(`[MAD] ⚠️ Course ${course.Name} : Société bénéficiaire = N/A`);
          console.log(`[MAD]   IO_Tournee__c: ${course.IO_Tournee__c}`);
          console.log(`[MAD]   IO_Tournee__r:`, course.IO_Tournee__r);
          console.log(`[MAD]   IO_Tournee__r?.IO_Societe__c: ${course.IO_Tournee__r?.IO_Societe__c || 'N/A'}`);
          console.log(`[MAD]   IO_Tournee__r?.IO_Societe__r:`, course.IO_Tournee__r?.IO_Societe__r);
        }

        // Grouper par bénéficiaire pour cet ODS
        if (!coursesParBeneficiaire[societeBeneficiaire]) {
          coursesParBeneficiaire[societeBeneficiaire] = {
            societeBeneficiaire,
            totalColis: 0,
            courses: []
          };
        }
        coursesParBeneficiaire[societeBeneficiaire].totalColis += nbColis;
        coursesParBeneficiaire[societeBeneficiaire].courses.push(course);
      });
      
      // Maintenant, créer une entrée par bénéficiaire (pas par course)
      Object.values(coursesParBeneficiaire).forEach(groupeBenef => {
        const societeBeneficiaire = groupeBenef.societeBeneficiaire;
        const colisBeneficiaire = groupeBenef.totalColis;
        
        // Calculer le poids de ce bénéficiaire dans la journée
        const poids = totalColis > 0 ? colisBeneficiaire / totalColis : 0;
        
        // Calculer les jours équivalents (1 jour × poids)
        const joursEquivalents = poids;

        // ═══════════════════════════════════════════════════════════
        // DÉTERMINER SI C'EST UNE MAD
        // Société bénéficiaire = Société de la tournée
        // RÈGLE : MAD = TRUE quand employeur ≠ bénéficiaire
        // ═══════════════════════════════════════════════════════════
        // Normaliser les chaînes pour comparaison (trim + uppercase)
        const employeurNormalise = (employeur || '').trim().toUpperCase();
        const societeBeneficiaireNormalise = (societeBeneficiaire || '').trim().toUpperCase();
        const porteuseNormalise = (porteuse || '').trim().toUpperCase();
        
        // MAD = TRUE si employeur ≠ bénéficiaire (et les deux sont valides)
        const estMadChauffeur = employeurNormalise !== societeBeneficiaireNormalise &&
          employeurNormalise !== 'N/A' &&
          employeurNormalise !== '' &&
          societeBeneficiaireNormalise !== 'N/A' &&
          societeBeneficiaireNormalise !== '';

        const estMadVehicule = porteuseNormalise !== societeBeneficiaireNormalise &&
          porteuseNormalise !== 'N/A' &&
          porteuseNormalise !== '' &&
          societeBeneficiaireNormalise !== 'N/A' &&
          societeBeneficiaireNormalise !== '';

        if (index < 3) {
          console.log(`[MAD]     Bénéficiaire ${societeBeneficiaire}:`);
          console.log(`[MAD]       Colis: ${colisBeneficiaire} / ${totalColis} (${(poids * 100).toFixed(1)}%)`);
          console.log(`[MAD]       Jours équiv: ${joursEquivalents.toFixed(3)}`);
          console.log(`[MAD]       Employeur: "${employeur}" (normalisé: "${employeurNormalise}")`);
          console.log(`[MAD]       Bénéficiaire: "${societeBeneficiaire}" (normalisé: "${societeBeneficiaireNormalise}")`);
          console.log(`[MAD]       MAD chauffeur: ${estMadChauffeur} (${employeurNormalise} ${estMadChauffeur ? '≠' : '='} ${societeBeneficiaireNormalise})`);
          console.log(`[MAD]       MAD véhicule: ${estMadVehicule} (${porteuseNormalise} ${estMadVehicule ? '≠' : '='} ${societeBeneficiaireNormalise})`);
        }

        if (estMadChauffeur) totalMadChauf++;
        if (estMadVehicule) totalMadVeh++;

        // ═══════════════════════════════════════════════════════════
        // CRÉER L'ENTRÉE CHAUFFEUR (une seule par bénéficiaire et par jour)
        // ═══════════════════════════════════════════════════════════
        // Le % MAD = poids de ce bénéficiaire dans la journée (en %)
        // Exemple : 150 colis / 200 colis = 75% de la journée pour ce bénéficiaire
        const pourcentageDansJournee = poids * 100;
        
        const entreeChauf = {
          chauffeur: chauffeur,
          employeur: employeur,
          societeBeneficiaire: societeBeneficiaire, // Société de la tournée
          joursMAD: estMadChauffeur ? joursEquivalents : 0,
          joursTotal: joursEquivalents, // Jours travaillés pour ce bénéficiaire ce jour (pro-rata)
          // ═══════════════════════════════════════════════════════════
          // % MAD = % de ce bénéficiaire dans la journée (pro-rata par colis)
          // Exemple : 90 colis D&J / 100 colis total = 90% du temps pour D&J
          // Si c'est une MAD (employeur ≠ bénéficiaire), alors % MAD = 90%
          // Si ce n'est pas une MAD (employeur = bénéficiaire), alors % MAD = 0 mais % travail = 10%
          // ═══════════════════════════════════════════════════════════
          pourcentageMAD: estMadChauffeur ? pourcentageDansJournee : 0, // % de ce bénéficiaire dans la journée (seulement si MAD)
          pourcentageTravail: pourcentageDansJournee, // % de ce bénéficiaire dans la journée (TOUS, MAD ou non)
          joursEquivalents: joursEquivalents,
          pourcentage: estMadChauffeur ? pourcentageDansJournee : 0,
          date: date,
          ods: ods.Name, // Numéro de l'ODS
          nbColis: colisBeneficiaire,
          totalColis: totalColis,
          poids: poids,
          nbCourses: groupeBenef.courses.length // Nombre de courses pour ce bénéficiaire
        };

        resultats.chauffeurs.push(entreeChauf);

        // ═══════════════════════════════════════════════════════════
        // CRÉER L'ENTRÉE VÉHICULE (une seule par bénéficiaire et par jour)
        // ═══════════════════════════════════════════════════════════
        const pourcentageDansJourneeVeh = poids * 100;
        
        const entreeVeh = {
          vehicule: vehicule,
          porteuse: porteuse,
          societeBeneficiaire: societeBeneficiaire, // Société de la tournée
          joursMAD: estMadVehicule ? joursEquivalents : 0,
          joursTotal: joursEquivalents, // Jours utilisés pour ce bénéficiaire ce jour (pro-rata)
          pourcentageMAD: estMadVehicule ? pourcentageDansJourneeVeh : 0, // % de ce bénéficiaire dans la journée
          joursEquivalents: joursEquivalents,
          pourcentage: estMadVehicule ? pourcentageDansJourneeVeh : 0,
          date: date,
          ods: ods.Name, // Numéro de l'ODS
          nbColis: colisBeneficiaire,
          totalColis: totalColis,
          poids: poids,
          nbCourses: groupeBenef.courses.length // Nombre de courses pour ce bénéficiaire
        };

        resultats.vehicules.push(entreeVeh);
      });
    });

    console.log(`[MAD] ────────────────────────────────────────────`);
    console.log(`[MAD] Total entrées chauffeurs: ${resultats.chauffeurs.length}`);
    console.log(`[MAD] Total entrées véhicules: ${resultats.vehicules.length}`);
    console.log(`[MAD] Entrées MAD chauffeurs: ${totalMadChauf}`);
    console.log(`[MAD] Entrées MAD véhicules: ${totalMadVeh}`);
    
    // Debug : afficher quelques exemples de véhicules MAD
    const vehiculesMAD = resultats.vehicules.filter(v => v.joursMAD > 0);
    if (vehiculesMAD.length > 0) {
      console.log(`[MAD] Exemples de véhicules en MAD (3 premiers):`);
      vehiculesMAD.slice(0, 3).forEach((v, idx) => {
        console.log(`[MAD]   ${idx + 1}. ${v.vehicule} (${v.porteuse}) → ${v.societeBeneficiaire}: ${v.joursMAD.toFixed(2)} jours MAD`);
      });
    } else {
      console.log(`[MAD] ⚠️ Aucun véhicule en MAD détecté`);
    }
    
    // Debug : statistiques véhicules
    const vehiculesParPorteuse = {};
    resultats.vehicules.forEach(v => {
      if (!vehiculesParPorteuse[v.porteuse]) {
        vehiculesParPorteuse[v.porteuse] = { total: 0, mad: 0 };
      }
      vehiculesParPorteuse[v.porteuse].total++;
      if (v.joursMAD > 0) vehiculesParPorteuse[v.porteuse].mad++;
    });
    console.log(`[MAD] Statistiques véhicules par porteuse:`);
    Object.entries(vehiculesParPorteuse).forEach(([port, stats]) => {
      console.log(`[MAD]   ${port}: ${stats.mad} MAD / ${stats.total} total`);
    });

    return resultats;
  }

  /**
   * Agrège les résultats par chauffeur et société
   */
  aggregerResultats(resultats, ordresService) {
    console.log('[MAD] Agrégation des résultats par chauffeur et société...');

    // ═══════════════════════════════════════════════════════════
    // CALCULER LE NOMBRE TOTAL DE JOURS TRAVAILLÉS PAR CHAUFFEUR
    // (nombre d'ODS distincts par chauffeur dans la période)
    // ═══════════════════════════════════════════════════════════
    const joursTravaillesParChauffeur = {};
    ordresService.forEach(ods => {
      const chauffeur = ods.IO_Chauffeur__r?.Name;
      if (chauffeur) {
        if (!joursTravaillesParChauffeur[chauffeur]) {
          joursTravaillesParChauffeur[chauffeur] = new Set();
        }
        // Ajouter la date comme jour travaillé (1 ODS = 1 jour)
        joursTravaillesParChauffeur[chauffeur].add(ods.IO_Date__c);
      }
    });
    
    // Convertir les Sets en nombres
    Object.keys(joursTravaillesParChauffeur).forEach(chauffeur => {
      joursTravaillesParChauffeur[chauffeur] = joursTravaillesParChauffeur[chauffeur].size;
    });
    
    console.log(`[MAD] Jours travaillés par chauffeur calculés pour ${Object.keys(joursTravaillesParChauffeur).length} chauffeurs`);
    Object.entries(joursTravaillesParChauffeur).slice(0, 10).forEach(([ch, jours]) => {
      console.log(`[MAD]   "${ch}": ${jours} jours travaillés`);
    });
    
    // Debug : vérifier que tous les chauffeurs des résultats ont un total
    const chauffeursDansResultats = [...new Set(resultats.chauffeurs.map(e => e.chauffeur))];
    const chauffeursSansTotal = chauffeursDansResultats.filter(ch => !joursTravaillesParChauffeur[ch]);
    if (chauffeursSansTotal.length > 0) {
      console.warn(`[MAD] ⚠️ ${chauffeursSansTotal.length} chauffeurs dans résultats sans jours travaillés calculés:`, chauffeursSansTotal.slice(0, 5));
    }

    // ═══════════════════════════════════════════════════════════
    // AGRÉGER LES CHAUFFEURS
    // ═══════════════════════════════════════════════════════════
    const agregationChauf = {};

    resultats.chauffeurs.forEach(entree => {
      // Clé unique : chauffeur + employeur + bénéficiaire
      const cle = `${entree.chauffeur}|${entree.employeur}|${entree.societeBeneficiaire}`;

      if (!agregationChauf[cle]) {
        agregationChauf[cle] = {
          chauffeur: entree.chauffeur,
          employeur: entree.employeur,
          societeBeneficiaire: entree.societeBeneficiaire,
          joursMAD: 0,
          joursTotal: 0, // Somme des jours équivalents pour ce bénéficiaire
          sommePoids: 0, // Somme des poids (pro-rata par colis) pour moyenner le %
          nbJours: 0, // Nombre de jours pour moyenner
          nbCourses: 0,
          details: [] // Tableau pour stocker les détails par jour/ODS
        };
      }

      agregationChauf[cle].joursMAD += entree.joursMAD;
      agregationChauf[cle].joursTotal += entree.joursTotal; // Jours travaillés pour ce bénéficiaire (pro-rata)
      agregationChauf[cle].sommePoids += entree.poids || 0; // Somme des poids pour calculer le % moyen
      agregationChauf[cle].nbJours += 1; // Un jour de plus
      agregationChauf[cle].nbCourses += 1;
      
      // Ajouter le détail de ce jour/ODS
      if (entree.date) {
        // Formater la date au format ISO (YYYY-MM-DD)
        let dateISO;
        if (entree.date instanceof Date) {
          dateISO = entree.date.toISOString().split('T')[0];
        } else if (typeof entree.date === 'string') {
          // Salesforce retourne généralement YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss.sssZ
          dateISO = entree.date.split('T')[0];
        } else {
          dateISO = String(entree.date).split('T')[0];
        }
        
        agregationChauf[cle].details.push({
          date: dateISO,
          ods: entree.ods || 'N/A', // Numéro de l'ODS
          joursMAD: entree.joursMAD || 0,
          joursTotal: entree.joursTotal || 0,
          estMAD: entree.joursMAD > 0,
          nbCourses: entree.nbCourses || 1,
          colis: entree.nbColis || 0
        });
      }
    });

    // Convertir en array et calculer les pourcentages
    const chauffeurs = Object.values(agregationChauf).map(agg => {
      // Jours travaillés totaux du chauffeur sur toute la période
      const joursTravaillesTotal = joursTravaillesParChauffeur[agg.chauffeur];
      
      if (!joursTravaillesTotal) {
        console.warn(`[MAD] ⚠️ Chauffeur "${agg.chauffeur}" non trouvé dans joursTravaillesParChauffeur`);
        console.warn(`[MAD]   Clés disponibles:`, Object.keys(joursTravaillesParChauffeur).slice(0, 5));
      }
      
      // Utiliser le total calculé, ou fallback sur la somme des jours équivalents
      const joursTotalFinal = joursTravaillesTotal || agg.joursTotal;
      
      // ═══════════════════════════════════════════════════════════
      // CALCUL DU % MAD
      // Le % MAD doit représenter la proportion du temps TOTAL travaillé par le chauffeur
      // qui est passé en mise à disposition pour ce bénéficiaire.
      // 
      // Formule : pourcentageMAD = (joursMAD / joursTravaillesTotal) × 100
      // 
      // Où :
      // - joursMAD = nombre de jours en MAD pour ce bénéficiaire spécifique
      // - joursTravaillesTotal = nombre total de jours travaillés par le chauffeur (tous bénéficiaires confondus)
      // 
      // Exemples :
      // - Chauffeur travaille 49 jours total, dont 13 jours MAD pour D&J → 13/49 = 26.5%
      // - Chauffeur travaille 43 jours total, dont 41 jours MAD pour D&J → 41/43 = 95.3%
      // - Chauffeur travaille 38 jours total, dont 19 jours MAD pour D&J → 19/38 = 50.0%
      // ═══════════════════════════════════════════════════════════
      const pourcentageMAD = joursTotalFinal > 0
        ? (agg.joursMAD / joursTotalFinal) * 100
        : 0;
      
      // Le % travail = proportion de ce bénéficiaire dans les jours travaillés totaux
      // (utilisé pour vérifier que la somme fait 100%)
      const pourcentageTravail = joursTotalFinal > 0
        ? (agg.joursTotal / joursTotalFinal) * 100
        : 0;
      
      // Debug pour Stéphane SOUAL et autres chauffeurs avec problèmes
      if (agg.chauffeur && (agg.chauffeur.includes('SOUAL') || agg.chauffeur.includes('BOUFFANDEAU'))) {
        console.log(`[MAD] 🔍 DEBUG ${agg.chauffeur} - ${agg.societeBeneficiaire}:`);
        console.log(`[MAD]   joursMAD (ce bénéficiaire): ${agg.joursMAD.toFixed(2)}`);
        console.log(`[MAD]   joursTravaillesTotal (tous bénéficiaires): ${joursTotalFinal}`);
        console.log(`[MAD]   Calcul: (${agg.joursMAD.toFixed(2)} / ${joursTotalFinal}) × 100 = ${pourcentageMAD.toFixed(1)}%`);
      }

      return {
        chauffeur: agg.chauffeur,
        employeur: agg.employeur,
        societeBeneficiaire: agg.societeBeneficiaire,
        joursMAD: agg.joursMAD,
        joursTotal: joursTotalFinal, // Total de jours travaillés sur la période
        joursTravaillesPourBeneficiaire: agg.joursTotal, // Jours travaillés pour ce bénéficiaire spécifique (pro-rata)
        pourcentageMAD: pourcentageMAD, // % de ce bénéficiaire dans la journée (seulement si MAD)
        pourcentageTravail: pourcentageTravail, // % de ce bénéficiaire dans la journée (TOUS, MAD ou non)
        joursEquivalents: agg.joursMAD,
        pourcentage: pourcentageMAD,
        nbCourses: agg.nbCourses,
        details: agg.details || [] // Détails par jour/ODS
      };
    });

    console.log(`[MAD] Chauffeurs agrégés: ${chauffeurs.length} combinaisons`);
    
    // Debug : vérifier quelques chauffeurs avec détails
    if (chauffeurs.length > 0) {
      console.log(`[MAD] Premier chauffeur avec détails:`, JSON.stringify({
        chauffeur: chauffeurs[0].chauffeur,
        employeur: chauffeurs[0].employeur,
        societeBeneficiaire: chauffeurs[0].societeBeneficiaire,
        joursMAD: chauffeurs[0].joursMAD,
        nbDetails: chauffeurs[0].details?.length || 0,
        premierDetail: chauffeurs[0].details?.[0] || null
      }, null, 2));
      console.log(`[MAD] Nombre de jours détaillés pour le premier chauffeur:`, chauffeurs[0].details?.length || 0);
    }
    
    // Debug : vérifier quelques chauffeurs
    chauffeurs.slice(0, 5).forEach(c => {
      const totalCalcule = joursTravaillesParChauffeur[c.chauffeur];
      console.log(`[MAD]   ${c.chauffeur}: joursTotal=${c.joursTotal}, totalCalculé=${totalCalcule || 'NON TROUVÉ'}, détails=${c.details?.length || 0}`);
    });

    // ═══════════════════════════════════════════════════════════
    // VÉRIFICATION : Pour chaque chauffeur, vérifier que la somme des jours MAD = jours travaillés
    // ═══════════════════════════════════════════════════════════
    const chauffeursParNom = {};
    chauffeurs.forEach(c => {
      if (!chauffeursParNom[c.chauffeur]) {
        chauffeursParNom[c.chauffeur] = [];
      }
      chauffeursParNom[c.chauffeur].push(c);
    });

    Object.entries(chauffeursParNom).forEach(([nomChauffeur, entrees]) => {
      const joursTravaillesTotal = joursTravaillesParChauffeur[nomChauffeur] || 0;
      const sommeJoursMAD = entrees.reduce((sum, e) => sum + e.joursMAD, 0);
      const sommePourcentages = entrees.reduce((sum, e) => sum + e.pourcentageMAD, 0);
      
      // Log spécial pour Stéphane SOUAL pour debug
      if (nomChauffeur.includes('SOUAL') || nomChauffeur.includes('Soual')) {
        console.log(`[MAD] 🔍 DEBUG ${nomChauffeur}:`);
        console.log(`[MAD]   Jours travaillés: ${joursTravaillesTotal}`);
        console.log(`[MAD]   Nombre de bénéficiaires (TOUS): ${entrees.length}`);
        
        // Séparer MAD et non-MAD
        const entreesMAD = entrees.filter(e => e.joursMAD > 0);
        const entreesNonMAD = entrees.filter(e => e.joursMAD === 0);
        
        console.log(`[MAD]   Bénéficiaires MAD: ${entreesMAD.length}`);
        console.log(`[MAD]   Bénéficiaires non-MAD: ${entreesNonMAD.length}`);
        
        const sommeJoursMADSeulement = entreesMAD.reduce((sum, e) => sum + e.joursMAD, 0);
        const sommePourcentagesMADSeulement = entreesMAD.reduce((sum, e) => sum + e.pourcentageMAD, 0);
        const sommePourcentagesTous = entrees.reduce((sum, e) => sum + e.pourcentageMAD, 0);
        
        console.log(`[MAD]   Somme jours MAD (MAD uniquement): ${sommeJoursMADSeulement.toFixed(2)}`);
        console.log(`[MAD]   Somme % MAD (MAD uniquement): ${sommePourcentagesMADSeulement.toFixed(1)}%`);
        console.log(`[MAD]   Somme % MAD (TOUS bénéficiaires): ${sommePourcentagesTous.toFixed(1)}%`);
        console.log(`[MAD]   Détail par bénéficiaire (TOUS):`);
        entrees.forEach(e => {
          const estMAD = e.joursMAD > 0 ? '✓ MAD' : '✗ non-MAD';
          const pctTravail = e.pourcentageTravail || e.pourcentageMAD || 0;
          console.log(`[MAD]     - ${e.societeBeneficiaire} (${estMAD}): ${e.joursMAD.toFixed(2)} jours MAD, ${e.pourcentageMAD.toFixed(1)}% MAD, ${pctTravail.toFixed(1)}% travail`);
        });
      }
      
      if (joursTravaillesTotal > 0) {
        const ecartJours = Math.abs(sommeJoursMAD - joursTravaillesTotal);
        const ecartPourcent = Math.abs(sommePourcentages - 100);
        
        if (ecartJours > 0.1 || ecartPourcent > 1) { // Tolérance 0.1 jour ou 1%
          console.warn(`[MAD] ⚠️ ${nomChauffeur}:`);
          console.warn(`[MAD]   Jours travaillés: ${joursTravaillesTotal}`);
          console.warn(`[MAD]   Somme jours MAD: ${sommeJoursMAD.toFixed(2)} (écart: ${ecartJours.toFixed(2)} jours)`);
          console.warn(`[MAD]   Somme % MAD: ${sommePourcentages.toFixed(1)}% (écart: ${ecartPourcent.toFixed(1)}%)`);
          console.warn(`[MAD]   Détail par bénéficiaire:`);
          entrees.forEach(e => {
            console.warn(`[MAD]     - ${e.societeBeneficiaire}: ${e.joursMAD.toFixed(2)} jours (${e.pourcentageMAD.toFixed(1)}%)`);
          });
        } else {
          console.log(`[MAD] ✓ ${nomChauffeur}: ${sommeJoursMAD.toFixed(2)} jours MAD / ${joursTravaillesTotal} jours travaillés = ${sommePourcentages.toFixed(1)}%`);
        }
      }
    });

    // ═══════════════════════════════════════════════════════════
    // GROUPER PAR EMPLOYEUR POUR statsChauffeurs
    // ═══════════════════════════════════════════════════════════
    const statsChauffeurs = chauffeurs.reduce((acc, c) => {
      if (!acc[c.employeur]) {
        acc[c.employeur] = [];
      }
      acc[c.employeur].push(c);
      return acc;
    }, {});

    console.log(`[MAD] Stats chauffeurs: ${Object.keys(statsChauffeurs).length} employeurs`);
    Object.entries(statsChauffeurs).forEach(([emp, chaufs]) => {
      const nbUniques = [...new Set(chaufs.map(c => c.chauffeur))].length;
      console.log(`[MAD]   ${emp}: ${nbUniques} chauffeurs uniques, ${chaufs.length} lignes`);
    });

    // ═══════════════════════════════════════════════════════════
    // CALCULER LE NOMBRE TOTAL DE JOURS UTILISÉS PAR VÉHICULE
    // ═══════════════════════════════════════════════════════════
    const joursUtilisesParVehicule = {};
    ordresService.forEach(ods => {
      const vehicule = ods.IO_Vehicule__r?.Name;
      if (vehicule) {
        if (!joursUtilisesParVehicule[vehicule]) {
          joursUtilisesParVehicule[vehicule] = new Set();
        }
        joursUtilisesParVehicule[vehicule].add(ods.IO_Date__c);
      }
    });
    
    Object.keys(joursUtilisesParVehicule).forEach(vehicule => {
      joursUtilisesParVehicule[vehicule] = joursUtilisesParVehicule[vehicule].size;
    });

    // ═══════════════════════════════════════════════════════════
    // AGRÉGER LES VÉHICULES (même logique que chauffeurs)
    // ═══════════════════════════════════════════════════════════
    const agregationVeh = {};

    resultats.vehicules.forEach(entree => {
      const cle = `${entree.vehicule}|${entree.porteuse}|${entree.societeBeneficiaire}`;

      if (!agregationVeh[cle]) {
        agregationVeh[cle] = {
          vehicule: entree.vehicule,
          porteuse: entree.porteuse,
          societeBeneficiaire: entree.societeBeneficiaire,
          joursMAD: 0,
          joursTotal: 0, // Somme des jours équivalents pour ce bénéficiaire
          nbCourses: 0,
          colis: 0, // Cumul des colis pour ce bénéficiaire
          details: [] // Tableau pour stocker les détails par jour/ODS
        };
      }

      agregationVeh[cle].joursMAD += entree.joursMAD;
      agregationVeh[cle].joursTotal += entree.joursTotal; // Jours utilisés pour ce bénéficiaire (pro-rata)
      agregationVeh[cle].nbCourses += 1;
      agregationVeh[cle].colis += entree.nbColis || 0; // Cumul des colis
      
      // Ajouter le détail de ce jour/ODS
      if (entree.date) {
        // Formater la date au format ISO (YYYY-MM-DD)
        let dateISO;
        if (entree.date instanceof Date) {
          dateISO = entree.date.toISOString().split('T')[0];
        } else if (typeof entree.date === 'string') {
          // Salesforce retourne généralement YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss.sssZ
          dateISO = entree.date.split('T')[0];
        } else {
          dateISO = String(entree.date).split('T')[0];
        }
        
        agregationVeh[cle].details.push({
          date: dateISO,
          ods: entree.ods || 'N/A', // Numéro de l'ODS
          joursMAD: entree.joursMAD || 0,
          joursTotal: entree.joursTotal || 0,
          estMAD: entree.joursMAD > 0,
          nbCourses: entree.nbCourses || 1,
          colis: entree.nbColis || 0
        });
      }
    });

    const vehicules = Object.values(agregationVeh).map(agg => {
      // Jours utilisés totaux du véhicule sur toute la période
      const joursUtilisesTotal = joursUtilisesParVehicule[agg.vehicule] || agg.joursTotal;
      
      if (!joursUtilisesParVehicule[agg.vehicule]) {
        console.warn(`[MAD] ⚠️ Véhicule "${agg.vehicule}" non trouvé dans joursUtilisesParVehicule`);
      }
      
      // ═══════════════════════════════════════════════════════════
      // DÉTECTION VÉHICULE GÉNÉRIQUE
      // Les véhicules avec immatriculation "AA-XXX-XX" sont génériques
      // et représentent plusieurs véhicules personnels utilisés simultanément
      // ═══════════════════════════════════════════════════════════
      const estGenerique = agg.vehicule && agg.vehicule.startsWith('AA-');
      
      // ═══════════════════════════════════════════════════════════
      // CALCUL DU % MAD POUR VÉHICULE
      // ═══════════════════════════════════════════════════════════
      let pourcentageMAD;
      
      if (estGenerique) {
        // Véhicule générique : garde le calcul actuel (pourcentages > 100% acceptés)
        // Car il représente plusieurs véhicules utilisés simultanément
        const joursUtilisesPourBeneficiaire = agg.joursTotal || 0;
        pourcentageMAD = joursUtilisesPourBeneficiaire > 0
          ? (agg.joursMAD / joursUtilisesPourBeneficiaire) * 100
          : 0;
      } else {
        // Véhicule de flotte : calcul corrigé (même logique que chauffeurs)
        // pourcentageMAD = (joursMAD / joursUtilisesTotal) × 100
        // Où :
        // - joursMAD = nombre de jours en MAD pour ce bénéficiaire spécifique
        // - joursUtilisesTotal = nombre total de jours utilisés par le véhicule (tous bénéficiaires confondus)
        pourcentageMAD = joursUtilisesTotal > 0
          ? (agg.joursMAD / joursUtilisesTotal) * 100
          : 0;
      }
      
      // Log de debug
      console.log(`[MAD] Véhicule ${agg.vehicule}: ${estGenerique ? 'GÉNÉRIQUE' : 'FLOTTE'}, %MAD=${pourcentageMAD.toFixed(1)}%, joursMAD=${agg.joursMAD.toFixed(1)}, joursTotal=${joursUtilisesTotal}`);

      return {
        vehicule: agg.vehicule,
        porteuse: agg.porteuse,
        societeBeneficiaire: agg.societeBeneficiaire,
        joursMAD: agg.joursMAD,
        joursTotal: joursUtilisesTotal, // Total de jours utilisés sur la période (tous bénéficiaires)
        joursUtilisesPourBeneficiaire: agg.joursTotal, // Jours utilisés pour ce bénéficiaire spécifique (pro-rata)
        pourcentageMAD: pourcentageMAD,
        joursEquivalents: agg.joursMAD,
        pourcentage: pourcentageMAD,
        nbCourses: agg.nbCourses,
        colis: agg.colis || 0, // Total de colis pour ce bénéficiaire
        estGenerique: estGenerique, // Indicateur véhicule générique
        details: agg.details || [] // Détails par jour/ODS
      };
    });

    const statsVehicules = vehicules.reduce((acc, v) => {
      if (!acc[v.porteuse]) {
        acc[v.porteuse] = [];
      }
      acc[v.porteuse].push(v);
      return acc;
    }, {});

    console.log(`[MAD] Véhicules agrégés: ${vehicules.length} combinaisons`);
    console.log(`[MAD] Stats véhicules: ${Object.keys(statsVehicules).length} porteuses`);
    
    // Séparer véhicules génériques et flotte
    const vehiculesGeneriques = vehicules.filter(v => v.estGenerique);
    const vehiculesFlotte = vehicules.filter(v => !v.estGenerique);
    
    console.log(`[MAD] Véhicules génériques: ${vehiculesGeneriques.length}`);
    console.log(`[MAD] Véhicules flotte: ${vehiculesFlotte.length}`);
    
    // Log détaillé par porteuse
    Object.entries(statsVehicules).forEach(([port, vehs]) => {
      const nbUniques = [...new Set(vehs.map(v => v.vehicule))].length;
      const vehsMAD = vehs.filter(v => v.joursMAD > 0);
      const vehsGeneriques = vehs.filter(v => v.estGenerique);
      console.log(`[MAD]   ${port}: ${nbUniques} véhicules uniques (${vehsGeneriques.length} génériques), ${vehs.length} lignes, ${vehsMAD.length} en MAD`);
    });
    
    // Debug : vérifier quelques véhicules avec détails
    if (vehicules.length > 0) {
      console.log(`[MAD] Premier véhicule avec détails:`, JSON.stringify({
        vehicule: vehicules[0].vehicule,
        porteuse: vehicules[0].porteuse,
        societeBeneficiaire: vehicules[0].societeBeneficiaire,
        joursMAD: vehicules[0].joursMAD,
        nbDetails: vehicules[0].details?.length || 0,
        premierDetail: vehicules[0].details?.[0] || null
      }, null, 2));
      console.log(`[MAD] Nombre de jours détaillés pour le premier véhicule:`, vehicules[0].details?.length || 0);
    }
    
    // Debug : vérifier quelques véhicules
    vehicules.slice(0, 5).forEach(v => {
      const totalCalcule = joursUtilisesParVehicule[v.vehicule];
      const type = v.estGenerique ? 'GÉNÉRIQUE' : 'FLOTTE';
      console.log(`[MAD]   ${v.vehicule} (${type}): joursTotal=${v.joursTotal}, totalCalculé=${totalCalcule || 'NON TROUVÉ'}, %MAD=${v.pourcentageMAD.toFixed(1)}%, détails=${v.details?.length || 0}`);
    });

    return {
      chauffeurs: chauffeurs,
      vehicules: vehicules,
      statsChauffeurs: statsChauffeurs,
      statsVehicules: statsVehicules
    };
  }

  /**
   * Analyse les mises à disposition pour une période donnée
   */
  async analyser({ dateDebut, dateFin, societePreteur, societeEmprunteur }) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 DEBUG FONCTION ANALYSER - DÉBUT');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Paramètres reçus:', { dateDebut, dateFin, societePreteur, societeEmprunteur });
    console.log('Type de this:', typeof this);
    console.log('Méthodes disponibles:', Object.getOwnPropertyNames(Object.getPrototypeOf(this)));
    console.log('═══════════════════════════════════════════════════════');
    
    console.log('[MAD] ═══════════════════════════════════════════════════════');
    console.log('[MAD] ANALYSE DES MISES À DISPOSITION');
    console.log('[MAD] ═══════════════════════════════════════════════════════');
    console.log(`[MAD] Période : ${dateDebut} → ${dateFin}`);
    console.log(`[MAD] Filtre prêteur : ${societePreteur || 'Toutes'}`);
    console.log(`[MAD] Filtre emprunteur : ${societeEmprunteur || 'Toutes'}`);

    // ═══════════════════════════════════════════════════════════
    // ÉTAPE 1 : RÉCUPÉRER LES ODS
    // ═══════════════════════════════════════════════════════════
    console.log('[MAD] Étape 1 : Récupération des ODS...');

    // Utiliser la méthode existante getOrdresDeService qui gère déjà la pagination
    const ordresService = await this.sfService.getOrdresDeService(dateDebut, dateFin);

    console.log(`[MAD] ✅ ${ordresService.length} ODS récupérés`);
    
    // Debug : afficher la structure du premier ODS
    if (ordresService.length > 0) {
      console.log('[MAD] Structure premier ODS:', JSON.stringify(ordresService[0], null, 2));
    }

    if (ordresService.length === 0) {
      console.log('[MAD] ⚠️ Aucun ODS trouvé pour cette période');
      return {
        chauffeurs: [],
        vehicules: [],
        statsChauffeurs: {},
        statsVehicules: {},
        totaux: {
          employes: {},
          vehicules: {}
        }
      };
    }

    // ═══════════════════════════════════════════════════════════
    // ÉTAPE 2 : RÉCUPÉRER LES COURSES
    // ═══════════════════════════════════════════════════════════
    console.log('[MAD] Étape 2 : Récupération des courses...');

    const odsIds = ordresService.map(ods => ods.Id);
    const courses = await this.recupererCourses(odsIds);

    console.log(`[MAD] ✅ ${courses.length} courses récupérées`);

    if (courses.length === 0) {
      console.log('[MAD] ⚠️ Aucune course trouvée - Vérifier la requête SOQL');
      console.log('[MAD] ⚠️ Cela peut signifier :');
      console.log('[MAD]   1. Aucune course liée aux ODS de la période');
      console.log('[MAD]   2. Erreur dans la requête SOQL (champ inexistant)');
      console.log('[MAD]   3. Problème de pagination');
      
      // Retourner quand même un résultat vide mais avec structure correcte
      return {
        chauffeurs: [],
        vehicules: [],
        statsChauffeurs: {},
        statsVehicules: {},
        totaux: {
          employes: {},
          vehicules: {}
        }
      };
    }
    
    // Debug : vérifier que les courses ont bien un chargeur
    const coursesAvecChargeur = courses.filter(c => c.IO_Chargeur__r?.Name || c.IO_Chargeur__c);
    console.log(`[MAD] Courses avec chargeur: ${coursesAvecChargeur.length} / ${courses.length}`);
    
    if (coursesAvecChargeur.length === 0) {
      console.log('[MAD] 🚨 PROBLÈME : Aucune course n\'a de chargeur !');
      console.log('[MAD] Vérifier que le champ IO_Chargeur__r.Name existe dans Salesforce');
    }

    // ═══════════════════════════════════════════════════════════
    // ÉTAPE 3 : ANALYSER LES MAD PAR NOMBRE DE COLIS
    // ═══════════════════════════════════════════════════════════
    console.log('[MAD] Étape 3 : Analyse des MAD...');

    const resultats = this.analyserMiseADisposition(ordresService, courses);

    // ═══════════════════════════════════════════════════════════
    // ÉTAPE 4 : AGRÉGER LES RÉSULTATS
    // ═══════════════════════════════════════════════════════════
    console.log('[MAD] Étape 4 : Agrégation des résultats...');

    const resultatsAgreges = this.aggregerResultats(resultats, ordresService);

    // ═══════════════════════════════════════════════════════════
    // ÉTAPE 5 : COMPTER LES EMPLOYÉS ET VÉHICULES
    // ═══════════════════════════════════════════════════════════
    console.log('[MAD] Étape 5 : Comptage des employés et véhicules...');

    const societesEmployeurs = [...new Set(resultatsAgreges.chauffeurs.map(c => c.employeur).filter(e => e !== 'N/A'))];
    const societesPorteuses = [...new Set(resultatsAgreges.vehicules.map(v => v.porteuse).filter(p => p !== 'N/A'))];

    const employesCount = await this.sfService.countEmployesByEmployeur(societesEmployeurs, dateDebut, dateFin);
    const vehiculesCount = await this.sfService.countVehiculesByPorteuse(societesPorteuses, dateDebut, dateFin);

    console.log('═══════════════════════════════════════════════════════');
    console.log('🔍 DEBUG FONCTION ANALYSER - FIN');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Résultats à retourner:');
    console.log('  - Chauffeurs:', resultatsAgreges.chauffeurs?.length || 0);
    console.log('  - Véhicules:', resultatsAgreges.vehicules?.length || 0);
    console.log('  - Stats chauffeurs:', Object.keys(resultatsAgreges.statsChauffeurs || {}).length);

    if (resultatsAgreges.chauffeurs?.length > 0) {
      console.log('Premier chauffeur:', JSON.stringify(resultatsAgreges.chauffeurs[0], null, 2));
      console.log('Premiers 3 chauffeurs:');
      resultatsAgreges.chauffeurs.slice(0, 3).forEach((c, idx) => {
        console.log(`  ${idx + 1}. ${c.chauffeur} (${c.employeur}) → ${c.societeBeneficiaire} : ${c.joursMAD} jours MAD`);
      });
    } else {
      console.log('⚠️ AUCUN CHAUFFEUR DANS LES RÉSULTATS !');
    }
    console.log('═══════════════════════════════════════════════════════');

    console.log('[MAD] ═══════════════════════════════════════════════════════');
    console.log(`[MAD] ✅ Analyse terminée`);
    console.log(`[MAD] Résultat : ${resultatsAgreges.chauffeurs.length} entrées chauffeurs`);
    console.log(`[MAD] Résultat : ${resultatsAgreges.vehicules.length} entrées véhicules`);
    console.log(`[MAD] Stats chauffeurs : ${Object.keys(resultatsAgreges.statsChauffeurs || {}).length} employeurs`);
    console.log(`[MAD] Stats véhicules : ${Object.keys(resultatsAgreges.statsVehicules || {}).length} porteuses`);
    
    // Debug : afficher quelques exemples de véhicules dans les résultats finaux
    if (resultatsAgreges.vehicules && resultatsAgreges.vehicules.length > 0) {
      const vehsMAD = resultatsAgreges.vehicules.filter(v => v.joursMAD > 0);
      console.log(`[MAD] Véhicules en MAD : ${vehsMAD.length} / ${resultatsAgreges.vehicules.length}`);
      if (vehsMAD.length > 0) {
        console.log(`[MAD] Exemples de véhicules MAD (3 premiers):`);
        vehsMAD.slice(0, 3).forEach((v, idx) => {
          console.log(`[MAD]   ${idx + 1}. ${v.vehicule} (${v.porteuse}) → ${v.societeBeneficiaire}: ${v.joursMAD.toFixed(2)} jours MAD (${v.pourcentageMAD.toFixed(1)}%)`);
        });
      }
    }
    console.log('[MAD] ═══════════════════════════════════════════════════════');

    return {
      ...resultatsAgreges,
      totaux: {
        employes: employesCount,
        vehicules: vehiculesCount
      }
    };
  }
}

module.exports = MiseADispositionService;







