import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line,
  BarChart, Bar,
  PieChart, Pie, Cell,
  AreaChart, Area,
  ComposedChart,
  XAxis, YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell as RechartsCell
} from 'recharts';
import { 
  BarChart3, 
  Download, 
  Calendar, 
  Building2, 
  TrendingUp, 
  TrendingDown,
  Users,
  AlertCircle,
  FileText,
  X,
  User,
  ArrowLeft,
  FileSpreadsheet
} from 'lucide-react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { startOfMonth, endOfMonth, subMonths, format, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import CountUp from 'react-countup';
import { motion } from 'framer-motion';
import * as XLSX from 'xlsx';
import API_BASE from '../../config/api';
const COLORS = {
  primary: '#3B82F6',
  secondary: '#8B5CF6',
  success: '#10B981',
  danger: '#EF4444',
  warning: '#F59E0B',
  info: '#06B6D4',
  g2l: '#1E40AF',
  tsm: '#7C3AED'
};

const CP_COLOR = '#3B82F6';
const MALADIE_COLOR = '#EF4444';

const MOIS_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

// Tooltip personnalisé
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-xl p-4">
        <p className="font-bold text-gray-900 mb-2">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center gap-2 mb-1">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-sm text-gray-700">
              {entry.name}: 
              <span className="font-bold ml-1">{entry.value}</span>
            </span>
          </div>
        ))}
        {payload.length > 1 && payload[0].value > 0 && payload[1].value > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              Ratio CP/Maladie : {(payload[0].value / payload[1].value).toFixed(1)}
            </p>
          </div>
        )}
      </div>
    );
  }
  return null;
};

export default function DashboardGraphique() {
  const [employes, setEmployes] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [soldesCP, setSoldesCP] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // États pour dates personnalisées
  const [dateDebut, setDateDebut] = useState(subMonths(new Date(), 12));
  const [dateFin, setDateFin] = useState(new Date());
  const [periodeRapide, setPeriodeRapide] = useState('1an');
  
  // États pour modals drill-down
  const [modalDetailed, setModalDetailed] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [modalSociete, setModalSociete] = useState(false);
  const [selectedSociete, setSelectedSociete] = useState(null);
  const [modalType, setModalType] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [societe, setSociete] = useState('Toutes');
  const [viewLevel, setViewLevel] = useState('year'); // year | month | week
  const [selectedMois, setSelectedMois] = useState(null);
  const [selectedSemaine, setSelectedSemaine] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const resEmployes = await fetch(`${API_BASE}/api/employes`);
      const dataEmployes = await resEmployes.json();
      setEmployes(dataEmployes.employes || []);

      const resAbsences = await fetch(`${API_BASE}/api/absences`);
      const dataAbsences = await resAbsences.json();
      setAbsences(dataAbsences || []);

      const resSoldes = await fetch(`${API_BASE}/api/soldes-cp`);
      const dataSoldes = await resSoldes.json();
      setSoldesCP(dataSoldes || []);

      setLoading(false);
    } catch (error) {
      console.error('Erreur récupération données:', error);
      setLoading(false);
    }
  };

  // Fonction pour filtrer les absences par période
  const filtrerAbsencesParPeriode = (absencesList, debut, fin) => {
    return absencesList.filter(absence => {
      const absenceDebut = new Date(absence.dateDebut);
      const absenceFin = new Date(absence.dateFin);
      return (absenceDebut <= fin && absenceFin >= debut);
    });
  };

  // Gestion période rapide
  const handlePeriodeRapide = (periode) => {
    setPeriodeRapide(periode);
    const maintenant = new Date();
    
    switch(periode) {
      case '7j':
        setDateDebut(subDays(maintenant, 7));
        setDateFin(maintenant);
        break;
      case '30j':
        setDateDebut(subDays(maintenant, 30));
        setDateFin(maintenant);
        break;
      case '3m':
        setDateDebut(subMonths(maintenant, 3));
        setDateFin(maintenant);
        break;
      case '6m':
        setDateDebut(subMonths(maintenant, 6));
        setDateFin(maintenant);
        break;
      case '1an':
        setDateDebut(subMonths(maintenant, 12));
        setDateFin(maintenant);
        break;
      case 'annee':
        setDateDebut(new Date(maintenant.getFullYear(), 0, 1));
        setDateFin(maintenant);
        break;
      case 'custom':
        break;
    }
  };

  // Filtrer les données selon période et société
  const donneesFiltrees = useMemo(() => {
    const absencesFiltrees = filtrerAbsencesParPeriode(absences, dateDebut, dateFin);

    let employesFiltres = employes;
    let absencesFinales = absencesFiltrees;
    
    if (societe !== 'Toutes') {
      if (societe === 'G2L') {
        const societesG2L = ['HOLDING G2L', 'D & J transport', 'TPS TSMC EXPRESS'];
        employesFiltres = employes.filter(e => societesG2L.includes(e.societe));
        absencesFinales = absencesFiltrees.filter(a => {
          const employe = employes.find(e => e.id === a.employeId);
          return employe && societesG2L.includes(employe.societe);
        });
      } else if (societe === 'TSM') {
        const societesTSM = ['TSM EXP', 'TSM LOC', 'TSM COL AMZ', 'TSM COL', 'TSM LOG', 'TSM FRET', 'HOLDING TSM'];
        employesFiltres = employes.filter(e => societesTSM.includes(e.societe));
        absencesFinales = absencesFiltrees.filter(a => {
          const employe = employes.find(e => e.id === a.employeId);
          return employe && societesTSM.includes(employe.societe);
        });
      } else {
        employesFiltres = employes.filter(e => e.societe === societe);
        absencesFinales = absencesFiltrees.filter(a => {
          const employe = employes.find(e => e.id === a.employeId);
          return employe && employe.societe === societe;
        });
      }
    }

    return { absences: absencesFinales, employes: employesFiltres };
  }, [absences, employes, dateDebut, dateFin, societe]);

  // Absences validées uniquement
  const absencesValidees = useMemo(() => {
    return donneesFiltrees.absences.filter(a => a.statut === 'Validée');
  }, [donneesFiltrees]);

  // Calculer évolution mensuelle
  const evolutionMensuelle = useMemo(() => {
    const maintenant = new Date();
    const donnees = [];

    for (let i = 11; i >= 0; i--) {
      const date = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
      const mois = date.getMonth();
      const annee = date.getFullYear();

      const absencesMois = absencesValidees.filter(a => {
        const dateAbsence = new Date(a.dateDebut);
        return dateAbsence.getMonth() === mois && dateAbsence.getFullYear() === annee;
      });

      const cp = absencesMois.filter(a => a.type === 'CP').length;
      const maladie = absencesMois.filter(a => a.type === 'MALADIE').length;

      donnees.push({
        mois: MOIS_LABELS[mois],
        moisIndex: mois,
        annee,
        cp,
        maladie
      });
    }

    return donnees;
  }, [donneesFiltrees, absencesValidees]);

  // Calcul moyenne mobile pour tendance
  const calculerTendance = (data, key) => {
    return data.map((item, index) => {
      if (index === 0) return item[key];
      const start = Math.max(0, index - 2);
      const slice = data.slice(start, index + 1);
      const sum = slice.reduce((acc, curr) => acc + curr[key], 0);
      return Math.round((sum / slice.length) * 10) / 10;
    });
  };

  const evolutionAvecTendance = useMemo(() => {
    const tendanceCP = calculerTendance(evolutionMensuelle, 'cp');
    const tendanceMaladie = calculerTendance(evolutionMensuelle, 'maladie');
    return evolutionMensuelle.map((item, index) => ({
      ...item,
      tendanceCP: tendanceCP[index],
      tendanceMaladie: tendanceMaladie[index]
    }));
  }, [evolutionMensuelle]);

  // Répartition types absences
  const repartitionTypes = useMemo(() => {
    const cp = absencesValidees.filter(a => a.type === 'CP').length;
    const maladie = absencesValidees.filter(a => a.type === 'MALADIE').length;
    const autre = absencesValidees.filter(a => a.type !== 'CP' && a.type !== 'MALADIE').length;

    return [
      { name: 'Congés Payés', value: cp, color: CP_COLOR },
      { name: 'Arrêts Maladie', value: maladie, color: MALADIE_COLOR },
      { name: 'Autre', value: autre, color: COLORS.warning }
    ].filter(item => item.value > 0);
  }, [absencesValidees]);

  // Absences par société
  const absencesParSociete = useMemo(() => {
    const societesMap = {};

    absencesValidees.forEach(a => {
      const employe = employes.find(e => e.id === a.employeId);
      if (employe && employe.societe) {
        if (!societesMap[employe.societe]) {
          societesMap[employe.societe] = { absences: 0, employes: new Set() };
        }
        societesMap[employe.societe].absences++;
        societesMap[employe.societe].employes.add(employe.id);
      }
    });

    return Object.entries(societesMap)
      .map(([societe, data]) => ({
        societe,
        absences: data.absences,
        taux: donneesFiltrees.employes.filter(e => e.societe === societe).length > 0
          ? ((data.absences / donneesFiltrees.employes.filter(e => e.societe === societe).length) * 100).toFixed(1)
          : 0
      }))
      .sort((a, b) => b.absences - a.absences)
      .slice(0, 8);
  }, [absencesValidees, donneesFiltrees, employes]);

  // Tendance soldes CP
  const tendanceSoldesCP = useMemo(() => {
    const maintenant = new Date();
    const donnees = [];

    for (let i = 11; i >= 0; i--) {
      const date = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
      const mois = date.getMonth();

      const soldesMois = soldesCP
        .filter(s => {
          const employe = employes.find(e => e.id === s.employeId);
          if (!employe) return false;
          if (societe === 'G2L') {
            const societesG2L = ['HOLDING G2L', 'D & J transport', 'TPS TSMC EXPRESS'];
            return societesG2L.includes(employe.societe);
          }
          if (societe === 'TSM') {
            const societesTSM = ['TSM EXP', 'TSM LOC', 'TSM COL AMZ', 'TSM COL', 'TSM LOG', 'TSM FRET', 'HOLDING TSM'];
            return societesTSM.includes(employe.societe);
          }
          if (societe !== 'Toutes') {
            return employe.societe === societe;
          }
          return true;
        })
        .map(s => s.soldeActuel);

      if (soldesMois.length > 0) {
        const moyenne = soldesMois.reduce((a, b) => a + b, 0) / soldesMois.length;
        const min = Math.min(...soldesMois);
        const max = Math.max(...soldesMois);

        donnees.push({
          mois: MOIS_LABELS[mois],
          solde: Math.round(moyenne * 10) / 10,
          min: Math.round(min * 10) / 10,
          max: Math.round(max * 10) / 10
        });
      }
    }

    return donnees;
  }, [soldesCP, employes, societe]);

  // Calculer KPIs
  const kpis = useMemo(() => {
    const totalAbsences = absencesValidees.length;
    const totalEmployes = donneesFiltrees.employes.filter(e => e.estActif).length;
    const tauxAbsence = totalEmployes > 0 ? ((totalAbsences / totalEmployes) * 100).toFixed(1) : 0;
    
    const cpEnCours = absencesValidees.filter(a => 
      a.type === 'CP'
    ).length;
    
    const arretsMaladie = absencesValidees.filter(a => 
      a.type === 'MALADIE'
    ).length;

    // Évolution par rapport à la période précédente
    const dateLimitePrecedente = new Date(dateDebut);
    dateLimitePrecedente.setDate(dateLimitePrecedente.getDate() - Math.ceil((dateFin - dateDebut) / (1000 * 60 * 60 * 24)));

    const absencesPrecedentes = absences.filter(a => {
      const dateAbsence = new Date(a.dateDebut);
      return dateAbsence >= dateLimitePrecedente && dateAbsence < dateDebut;
    }).length;

    const evolution = absencesPrecedentes > 0 
      ? (((totalAbsences - absencesPrecedentes) / absencesPrecedentes) * 100).toFixed(1)
      : 0;

    return {
      totalAbsences,
      evolution,
      tauxAbsence,
      cpEnCours,
      arretsMaladie
    };
  }, [donneesFiltrees, dateDebut, dateFin, absences]);

  // Top 10 employés plus absents (absences validées uniquement)
  const calculerTop10Absents = () => {
    const absencesVal = absencesValidees;
    const compteur = {};
    
    absencesVal.forEach(absence => {
      const employe = employes.find(e => e.id === absence.employeId);
      if (!employe) return;
      
      if (!compteur[absence.employeId]) {
        compteur[absence.employeId] = {
          employeId: absence.employeId,
          nomComplet: employe.nomComplet,
          societe: employe.societe,
          joursAbsents: 0,
          nbAbsences: 0,
          absences: []
        };
      }
      
      const duree = absence.dureeJours || 0;
      compteur[absence.employeId].joursAbsents += duree;
      compteur[absence.employeId].nbAbsences += 1;
      compteur[absence.employeId].absences.push(absence);
    });
    
    return Object.values(compteur)
      .sort((a, b) => b.joursAbsents - a.joursAbsents)
      .slice(0, 10);
  };
  const top10Absents = useMemo(() => calculerTop10Absents(), [absencesValidees, employes]);

  // Top 5 sociétés taux absence
  const top5Societes = useMemo(() => {
    return absencesParSociete
      .map(s => ({
        societe: s.societe,
        taux: parseFloat(s.taux)
      }))
      .sort((a, b) => b.taux - a.taux)
      .slice(0, 5);
  }, [absencesParSociete]);

  // Employés solde CP négatif
  const soldesNegatifs = useMemo(() => {
    return soldesCP
      .filter(s => s.soldeActuel < 0)
      .map(s => {
        const employe = employes.find(e => e.id === s.employeId);
        return {
          nom: employe?.nomComplet || 'Inconnu',
          societe: employe?.societe || '—',
          solde: s.soldeActuel
        };
      })
      .sort((a, b) => a.solde - b.solde);
  }, [soldesCP, employes]);

  // Liste des sociétés uniques
  const societesUniques = useMemo(() => {
    const societes = ['Toutes', 'G2L', 'TSM'];
    const societesEmployes = [...new Set(employes.map(e => e.societe).filter(Boolean))];
    return [...societes, ...societesEmployes];
  }, [employes]);

  // Handlers pour drill-down
  const handleChartClick = (data) => {
    if (data && data.activePayload && data.activePayload[0]) {
      const period = data.activePayload[0].payload;
      setSelectedPeriod(period);
      setModalDetailed(true);
    }
  };

  const handleBarClick = (data) => {
    if (data && data.activePayload && data.activePayload[0]) {
      const societeData = data.activePayload[0].payload;
      setSelectedSociete(societeData.societe);
      setModalSociete(true);
    }
  };

  const handlePieClick = (data) => {
    if (data && data.name) {
      setSelectedType(data.name);
      setModalType(true);
    }
  };

  // Drill-down: clic sur mois
  const handleClickMois = (data) => {
    console.log('[DRILL-DOWN] Clic sur graphique:', data);
    
    if (!data) return;
    
    // Essayer différentes structures de données selon le type de clic (barre ou ligne)
    let moisData = null;
    
    // Si c'est un objet avec payload directement (depuis CustomBar)
    if (data.payload) {
      moisData = data.payload;
    } else if (data.activePayload && data.activePayload.length > 0) {
      // Clic sur une barre ou ligne (structure Recharts standard)
      moisData = data.activePayload[0].payload;
    } else if (data.activeLabel) {
      // Clic sur l'axe X (label du mois)
      const moisLabel = data.activeLabel;
      moisData = evolutionAvecTendance.find(item => item.mois === moisLabel);
    }
    
    if (moisData && moisData.mois) {
      console.log('[DRILL-DOWN] Mois sélectionné:', moisData);
      setSelectedMois(moisData);
      setSelectedSemaine(null);
      setViewLevel('month');
    } else {
      console.warn('[DRILL-DOWN] Impossible de trouver les données du mois cliqué. Data reçue:', data);
    }
  };

  // Préparer données par semaines pour un mois
  const preparerDonneesSemaines = (moisData) => {
    if (!moisData) return [];
    const moisIndex = MOIS_LABELS.indexOf(moisData.mois);
    const annee = moisData.annee || dateDebut.getFullYear();
    const premierJour = new Date(annee, moisIndex, 1);
    const dernierJour = new Date(annee, moisIndex + 1, 0);
    const semaines = [];
    let semaineNum = 1;
    let currentDate = new Date(premierJour);

    while (currentDate <= dernierJour) {
      const finSemaine = new Date(currentDate);
      finSemaine.setDate(finSemaine.getDate() + 6);
      if (finSemaine > dernierJour) finSemaine.setTime(dernierJour.getTime());

      const absencesSemaine = absencesValidees.filter(a => {
        const debutA = new Date(a.dateDebut);
        const finA = new Date(a.dateFin);
        return debutA <= finSemaine && finA >= currentDate;
      });

      const cp = absencesSemaine.filter(a => a.type === 'CP').length;
      const maladie = absencesSemaine.filter(a => a.type === 'MALADIE' || a.type === 'Maladie').length;

      semaines.push({
        semaine: `S${semaineNum}`,
        dateDebut: new Date(currentDate),
        dateFin: new Date(finSemaine),
        label: `${currentDate.getDate()} - ${finSemaine.getDate()} ${moisData.mois}`,
        cp,
        maladie,
        total: cp + maladie,
        absencesIds: absencesSemaine.map(a => a.id)
      });

      currentDate.setDate(currentDate.getDate() + 7);
      semaineNum++;
    }
    return semaines;
  };

  // Drill-down: clic sur semaine
  const handleClickSemaine = (data) => {
    console.log('[DRILL-DOWN] Clic sur semaine:', data);
    
    if (!data) return;
    
    let semaineData = null;
    
    if (data.activePayload && data.activePayload.length > 0) {
      semaineData = data.activePayload[0].payload;
    } else if (data.payload) {
      semaineData = data.payload;
    }
    
    if (semaineData) {
      console.log('[DRILL-DOWN] Semaine sélectionnée:', semaineData);
      setSelectedSemaine(semaineData);
      setViewLevel('week');
    } else {
      console.warn('[DRILL-DOWN] Impossible de trouver les données de la semaine cliquée');
    }
  };

  // Absences du mois sélectionné
  const absencesDuMois = useMemo(() => {
    if (!selectedPeriod) return [];
    
    return donneesFiltrees.absences.filter(a => {
      const dateAbsence = new Date(a.dateDebut);
      return dateAbsence.getMonth() === selectedPeriod.moisIndex && 
             dateAbsence.getFullYear() === selectedPeriod.annee;
    });
  }, [selectedPeriod, donneesFiltrees]);

  // Absences de la société sélectionnée
  const absencesSociete = useMemo(() => {
    if (!selectedSociete) return [];
    
    return donneesFiltrees.absences.filter(a => {
      const employe = employes.find(e => e.id === a.employeId);
      return employe && employe.societe === selectedSociete;
    });
  }, [selectedSociete, donneesFiltrees, employes]);

  // Absences du type sélectionné
  const absencesType = useMemo(() => {
    if (!selectedType) return [];
    
    const typeMap = {
      'Congés Payés': 'CP',
      'Arrêts Maladie': 'MALADIE'
    };
    
    return donneesFiltrees.absences.filter(a => {
      return a.type === (typeMap[selectedType] || selectedType);
    });
  }, [selectedType, donneesFiltrees]);

  // Export PDF
  const exportPDF = async () => {
    try {
      const element = document.getElementById('dashboard-content');
      if (!element) return;

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      
      const suffix = viewLevel === 'month' ? `-${selectedMois?.mois}` : 
                     viewLevel === 'week' ? `-${selectedSemaine?.label}` : '';
      pdf.save(`dashboard-rh-${format(dateDebut, 'yyyy-MM-dd')}-${format(dateFin, 'yyyy-MM-dd')}${suffix}.pdf`);
    } catch (error) {
      console.error('Erreur export PDF:', error);
      alert('Erreur lors de l\'export PDF');
    }
  };

  // Export Excel
  const exportExcel = () => {
    try {
      const workbook = XLSX.utils.book_new();
      
      if (viewLevel === 'week' && selectedSemaine) {
        // Export vue semaine : liste des employés absents
        const absencesSemaine = absencesValidees.filter(a => 
          selectedSemaine.absencesIds.includes(a.id)
        );
        
        const data = absencesSemaine.map(absence => {
          const employe = employes.find(e => e.id === absence.employeId);
          return {
            'Employé': employe?.nomComplet || 'Inconnu',
            'Société': employe?.societe || '—',
            'Type': absence.type === 'CP' ? 'Congés Payés' : 'Arrêt Maladie',
            'Date début': format(new Date(absence.dateDebut), 'dd/MM/yyyy', { locale: fr }),
            'Date fin': format(new Date(absence.dateFin), 'dd/MM/yyyy', { locale: fr }),
            'Durée (jours)': absence.dureeJours || 0,
            'Motif': absence.motif || '—'
          };
        });
        
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(workbook, ws, `Semaine ${selectedSemaine.label}`);
        
      } else if (viewLevel === 'month' && selectedMois) {
        // Export vue mois : semaines
        const semaines = preparerDonneesSemaines(selectedMois);
        const data = semaines.map(s => ({
          'Semaine': s.label,
          'Date début': format(s.dateDebut, 'dd/MM/yyyy', { locale: fr }),
          'Date fin': format(s.dateFin, 'dd/MM/yyyy', { locale: fr }),
          'Congés Payés': s.cp,
          'Arrêts Maladie': s.maladie,
          'Total': s.total
        }));
        
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(workbook, ws, `Mois ${selectedMois.mois}`);
        
      } else {
        // Export vue année : évolution mensuelle + top 10 + stats
        // Feuille 1: Évolution mensuelle
        const evolutionData = evolutionAvecTendance.map(e => ({
          'Mois': e.mois,
          'Congés Payés': e.cp,
          'Arrêts Maladie': e.maladie,
          'Total': e.cp + e.maladie,
          'Tendance CP': e.tendanceCP,
          'Tendance Maladie': e.tendanceMaladie
        }));
        const ws1 = XLSX.utils.json_to_sheet(evolutionData);
        XLSX.utils.book_append_sheet(workbook, ws1, 'Évolution Mensuelle');
        
        // Feuille 2: Top 10 employés
        const top10Data = top10Absents.map((emp, index) => ({
          'Rang': index + 1,
          'Employé': emp.nomComplet,
          'Société': emp.societe,
          'Jours absents': emp.joursAbsents,
          'Nombre absences': emp.nbAbsences
        }));
        const ws2 = XLSX.utils.json_to_sheet(top10Data);
        XLSX.utils.book_append_sheet(workbook, ws2, 'Top 10 Employés');
        
        // Feuille 3: Absences par société
        const societeData = absencesParSociete.map(s => ({
          'Société': s.societe,
          'Nombre absences': s.absences,
          'Taux absence (%)': s.taux
        }));
        const ws3 = XLSX.utils.json_to_sheet(societeData);
        XLSX.utils.book_append_sheet(workbook, ws3, 'Par Société');
        
        // Feuille 4: KPIs
        const kpisData = [{
          'Indicateur': 'Total Absences',
          'Valeur': kpis.totalAbsences,
          'Unité': 'absences'
        }, {
          'Indicateur': 'Taux Absence',
          'Valeur': kpis.tauxAbsence,
          'Unité': '%'
        }, {
          'Indicateur': 'CP en cours',
          'Valeur': kpis.cpEnCours,
          'Unité': 'absences'
        }, {
          'Indicateur': 'Arrêts Maladie',
          'Valeur': kpis.arretsMaladie,
          'Unité': 'absences'
        }];
        const ws4 = XLSX.utils.json_to_sheet(kpisData);
        XLSX.utils.book_append_sheet(workbook, ws4, 'KPIs');
      }
      
      const suffix = viewLevel === 'month' ? `-${selectedMois?.mois}` : 
                     viewLevel === 'week' ? `-${selectedSemaine?.label}` : '';
      XLSX.writeFile(workbook, `dashboard-rh-${format(dateDebut, 'yyyy-MM-dd')}-${format(dateFin, 'yyyy-MM-dd')}${suffix}.xlsx`);
    } catch (error) {
      console.error('Erreur export Excel:', error);
      alert('Erreur lors de l\'export Excel');
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen" id="dashboard-content">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl shadow-sm p-6 mb-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-blue-600" />
              Dashboard RH Graphique
            </h1>
            <p className="text-gray-600 mt-2">Analyse visuelle des absences et soldes CP</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={societe}
              onChange={(e) => setSociete(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {societesUniques.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <div className="flex gap-2">
              <button
                onClick={exportExcel}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                title="Exporter en Excel"
              >
                <FileSpreadsheet className="w-5 h-5" />
                <span className="hidden sm:inline">Excel</span>
              </button>
              <button
                onClick={exportPDF}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                title="Exporter en PDF"
              >
                <Download className="w-5 h-5" />
                <span className="hidden sm:inline">PDF</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Sélecteur de dates */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-xl shadow-lg p-6 mb-6"
      >
        <div className="flex flex-wrap items-center gap-4">
          {/* Présélections rapides */}
          <div className="flex flex-wrap gap-2">
            {[
              { value: '7j', label: '7 jours' },
              { value: '30j', label: '30 jours' },
              { value: '3m', label: '3 mois' },
              { value: '6m', label: '6 mois' },
              { value: '1an', label: '1 an' },
              { value: 'annee', label: 'Année en cours' },
              { value: 'custom', label: 'Personnalisé' }
            ].map(option => (
              <button
                key={option.value}
                onClick={() => handlePeriodeRapide(option.value)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  periodeRapide === option.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Date pickers personnalisés */}
          {periodeRapide === 'custom' && (
            <div className="flex flex-wrap items-center gap-4 ml-auto">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date début
                </label>
                <DatePicker
                  selected={dateDebut}
                  onChange={(date) => setDateDebut(date)}
                  selectsStart
                  startDate={dateDebut}
                  endDate={dateFin}
                  maxDate={dateFin}
                  dateFormat="dd/MM/yyyy"
                  locale={fr}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date fin
                </label>
                <DatePicker
                  selected={dateFin}
                  onChange={(date) => setDateFin(date)}
                  selectsEnd
                  startDate={dateDebut}
                  endDate={dateFin}
                  minDate={dateDebut}
                  maxDate={new Date()}
                  dateFormat="dd/MM/yyyy"
                  locale={fr}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full"
                />
              </div>
            </div>
          )}
        </div>

        {/* Affichage période sélectionnée */}
        <div className="mt-4 text-sm text-gray-600">
          Période analysée : 
          <span className="font-semibold text-gray-900 ml-2">
            {format(dateDebut, 'dd MMMM yyyy', { locale: fr })} 
            {' → '}
            {format(dateFin, 'dd MMMM yyyy', { locale: fr })}
          </span>
          <span className="ml-4 text-blue-600">
            ({Math.ceil((dateFin - dateDebut) / (1000 * 60 * 60 * 24))} jours)
          </span>
        </div>
      </motion.div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl shadow-sm p-6 hover:shadow-2xl transition-shadow duration-300 cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Total Absences</p>
              <p className="text-3xl font-bold text-gray-900 mt-1 group-hover:text-blue-600 transition-colors">
                <CountUp end={kpis.totalAbsences} duration={2} separator=" " />
              </p>
              <div className="flex items-center gap-2 mt-2">
                {parseFloat(kpis.evolution) >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-red-500" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-green-500" />
                )}
                <span className={`text-sm ${parseFloat(kpis.evolution) >= 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {Math.abs(parseFloat(kpis.evolution))}%
                </span>
              </div>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl shadow-sm p-6 hover:shadow-2xl transition-shadow duration-300 cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Taux Absence</p>
              <p className="text-3xl font-bold text-gray-900 mt-1 group-hover:text-blue-600 transition-colors">
                <CountUp end={parseFloat(kpis.tauxAbsence)} duration={2} decimals={1} suffix="%" />
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(parseFloat(kpis.tauxAbsence), 100)}%` }}
                ></div>
              </div>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-xl shadow-sm p-6 hover:shadow-2xl transition-shadow duration-300 cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">CP en cours</p>
              <p className="text-3xl font-bold text-gray-900 mt-1 group-hover:text-green-600 transition-colors">
                <CountUp end={kpis.cpEnCours} duration={2} separator=" " />
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
              <Calendar className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
          className="bg-white rounded-xl shadow-sm p-6 hover:shadow-2xl transition-shadow duration-300 cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 font-medium">Arrêts Maladie</p>
              <p className="text-3xl font-bold text-gray-900 mt-1 group-hover:text-red-600 transition-colors">
                <CountUp end={kpis.arretsMaladie} duration={2} separator=" " />
              </p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </motion.div>
      </div>

      {viewLevel === 'year' && (
        <>
          {/* Graphiques */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Graphique 1: Évolution mensuelle */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="bg-white rounded-xl shadow-sm p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Évolution Mensuelle des Absences</h3>
                  <p className="text-sm text-gray-500">Cliquez sur une barre (bleue ou rouge) pour afficher le détail par semaine.</p>
                </div>
                {evolutionAvecTendance.length > 0 && (
                  <button
                    onClick={() => {
                      // Test: cliquer sur le premier mois
                      handleClickMois({ payload: evolutionAvecTendance[0] });
                    }}
                    className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    Test: {evolutionAvecTendance[0]?.mois}
                  </button>
                )}
              </div>
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart 
                  data={evolutionAvecTendance}
                  onClick={handleClickMois}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis 
                    dataKey="mois" 
                    stroke="#6B7280"
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis 
                    stroke="#6B7280"
                    style={{ fontSize: '12px' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} />

                  <Bar 
                    dataKey="cp" 
                    fill={CP_COLOR}
                    name="Congés Payés"
                    radius={[8, 8, 0, 0]}
                    onClick={(data, index) => {
                      console.log('[CLIC] Barre CP cliquée:', data, index);
                      if (data && evolutionAvecTendance[index]) {
                        handleClickMois({ payload: evolutionAvecTendance[index] });
                      }
                    }}
                    cursor="pointer"
                  />
                  <Bar 
                    dataKey="maladie" 
                    fill={MALADIE_COLOR}
                    name="Arrêts Maladie"
                    radius={[8, 8, 0, 0]}
                    onClick={(data, index) => {
                      console.log('[CLIC] Barre Maladie cliquée:', data, index);
                      if (data && evolutionAvecTendance[index]) {
                        handleClickMois({ payload: evolutionAvecTendance[index] });
                      }
                    }}
                    cursor="pointer"
                  />

                  <Line 
                    type="monotone"
                    dataKey="tendanceCP"
                    stroke="#1E40AF"
                    strokeWidth={3}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Tendance CP"
                  />
                  <Line 
                    type="monotone"
                    dataKey="tendanceMaladie"
                    stroke="#991B1B"
                    strokeWidth={3}
                    strokeDasharray="5 5"
                    dot={false}
                    name="Tendance Maladie"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Graphique 2: Répartition types */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="bg-white rounded-xl shadow-sm p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Répartition des Types d'Absences</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={repartitionTypes}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    onClick={handlePieClick}
                    cursor="pointer"
                  >
                    {repartitionTypes.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Graphique 3: Absences par société */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="bg-white rounded-xl shadow-sm p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Absences par Société</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart 
                  data={absencesParSociete}
                  onClick={handleBarClick}
                  style={{ cursor: 'pointer' }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis 
                    dataKey="societe" 
                    stroke="#6B7280"
                    style={{ fontSize: '12px' }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis 
                    stroke="#6B7280"
                    style={{ fontSize: '12px' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar 
                    dataKey="absences" 
                    fill={COLORS.primary}
                    radius={[8, 8, 0, 0]}
                    cursor="pointer"
                    animationDuration={1000}
                  >
                    {absencesParSociete.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={`${COLORS.primary}${Math.max(20, 100 - index * 10)}`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Graphique 4: Tendance soldes CP */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="bg-white rounded-xl shadow-sm p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Tendance des Soldes CP</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={tendanceSoldesCP}>
                  <defs>
                    <linearGradient id="colorSolde" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.8}/>
                      <stop offset="95%" stopColor={COLORS.success} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis 
                    dataKey="mois" 
                    stroke="#6B7280"
                    style={{ fontSize: '12px' }}
                  />
                  <YAxis 
                    stroke="#6B7280"
                    style={{ fontSize: '12px' }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area 
                    type="monotone" 
                    dataKey="solde" 
                    stroke={COLORS.success} 
                    fillOpacity={1} 
                    fill="url(#colorSolde)"
                    animationDuration={1000}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          </div>

          {/* Rankings */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top 10 employés absents */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 }}
              className="bg-white rounded-xl shadow-sm p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 10 Employés Plus Absents (validées uniquement)</h3>
              <div className="space-y-2">
                {top10Absents.length > 0 ? (
                  top10Absents.map((emp, index) => (
                    <div key={emp.employeId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                          index === 0 ? 'bg-yellow-400 text-yellow-900' :
                          index === 1 ? 'bg-gray-300 text-gray-900' :
                          index === 2 ? 'bg-orange-400 text-orange-900' :
                          'bg-blue-100 text-blue-900'
                        }`}>
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{emp.nomComplet}</p>
                          <p className="text-xs text-gray-600">{emp.societe}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-red-600">{emp.joursAbsents}j</p>
                        <p className="text-xs text-gray-500">{emp.nbAbsences} absence(s)</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-4">Aucune donnée</p>
                )}
              </div>
            </motion.div>

            {/* Top 5 sociétés */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1 }}
              className="bg-white rounded-xl shadow-sm p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 5 Sociétés (Taux Absence)</h3>
              <div className="space-y-2">
                {top5Societes.length > 0 ? (
                  top5Societes.map((soc, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <Building2 className="w-5 h-5 text-gray-600" />
                        <p className="font-medium text-gray-900">{soc.societe}</p>
                      </div>
                      <span className="text-lg font-bold text-red-600">{soc.taux}%</span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-4">Aucune donnée</p>
                )}
              </div>
            </motion.div>

            {/* Soldes négatifs */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 }}
              className="bg-white rounded-xl shadow-sm p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                Soldes CP Négatifs
              </h3>
              <div className="space-y-2">
                {soldesNegatifs.length > 0 ? (
                  soldesNegatifs.map((emp, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200 hover:bg-red-100 transition-colors">
                      <div>
                        <p className="font-medium text-gray-900">{emp.nom}</p>
                        <p className="text-xs text-gray-600">{emp.societe}</p>
                      </div>
                      <span className="text-lg font-bold text-red-600">{emp.solde.toFixed(1)}j</span>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-4">Aucun solde négatif</p>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}

      {/* Vue Mois (drill-down) */}
      {viewLevel === 'month' && selectedMois && (
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-6"
        >
          {/* Navigation avec bouton retour - FIXE EN HAUT */}
          <div className="bg-white rounded-xl shadow-md p-4 sticky top-0 z-10 border-b-2 border-blue-500">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <button 
                onClick={() => {
                  setViewLevel('year');
                  setSelectedMois(null);
                  setSelectedSemaine(null);
                }} 
                className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-semibold shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                <ArrowLeft className="w-5 h-5" />
                ← Retour à l'année
              </button>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">Vue actuelle :</span>
                <span className="text-lg font-bold text-blue-600">{selectedMois.mois}</span>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900">Détail des absences - {selectedMois.mois}</h2>
            <p className="text-gray-600 mt-1">Répartition par semaine</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-600 font-medium">Congés Payés</p>
              <p className="text-3xl font-bold text-blue-900">{selectedMois.cp}</p>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <p className="text-sm text-red-600 font-medium">Arrêts Maladie</p>
              <p className="text-3xl font-bold text-red-900">{selectedMois.maladie}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <p className="text-sm text-purple-600 font-medium">Total</p>
              <p className="text-3xl font-bold text-purple-900">{selectedMois.cp + selectedMois.maladie}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Absences par Semaine</h3>
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart 
                data={preparerDonneesSemaines(selectedMois)}
                onClick={handleClickSemaine}
                style={{ cursor: 'pointer' }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis 
                  dataKey="label" 
                  stroke="#6B7280"
                  style={{ fontSize: '11px' }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis stroke="#6B7280" style={{ fontSize: '12px' }} />
                <Tooltip />
                <Legend />
                <Bar 
                  dataKey="cp" 
                  fill={CP_COLOR} 
                  name="Congés Payés" 
                  radius={[8, 8, 0, 0]}
                  onClick={(data, index) => {
                    const semaines = preparerDonneesSemaines(selectedMois);
                    if (data && semaines[index]) {
                      handleClickSemaine({ payload: semaines[index] });
                    }
                  }}
                  cursor="pointer"
                />
                <Bar 
                  dataKey="maladie" 
                  fill={MALADIE_COLOR} 
                  name="Arrêts Maladie" 
                  radius={[8, 8, 0, 0]}
                  onClick={(data, index) => {
                    const semaines = preparerDonneesSemaines(selectedMois);
                    if (data && semaines[index]) {
                      handleClickSemaine({ payload: semaines[index] });
                    }
                  }}
                  cursor="pointer"
                />
              </ComposedChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-500 mt-4 text-center">💡 Cliquez sur une semaine pour voir la liste des employés absents</p>
          </div>
        </motion.div>
      )}

      {/* Vue Semaine (drill-down) */}
      {viewLevel === 'week' && selectedSemaine && selectedMois && (
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-6"
        >
          {/* Navigation avec boutons retour - FIXE EN HAUT */}
          <div className="bg-white rounded-xl shadow-md p-4 sticky top-0 z-10 border-b-2 border-blue-500">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button 
                  onClick={() => {
                    setViewLevel('month');
                    setSelectedSemaine(null);
                  }} 
                  className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-semibold shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  <ArrowLeft className="w-5 h-5" />
                  ← Retour au mois
                </button>
                <button 
                  onClick={() => {
                    setViewLevel('year');
                    setSelectedMois(null);
                    setSelectedSemaine(null);
                  }} 
                  className="flex items-center gap-2 px-5 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all font-semibold shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  <ArrowLeft className="w-5 h-5" />
                  ← Retour à l'année
                </button>
              </div>
              <div className="flex items-center gap-2 text-sm bg-gray-50 px-4 py-2 rounded-lg">
                <span className="text-gray-500">Navigation :</span>
                <button 
                  onClick={() => {
                    setViewLevel('year');
                    setSelectedMois(null);
                    setSelectedSemaine(null);
                  }} 
                  className="text-blue-600 hover:text-blue-800 font-semibold hover:underline"
                >
                  Année
                </button>
                <span className="text-gray-400">/</span>
                <button
                  onClick={() => {
                    setViewLevel('month');
                    setSelectedSemaine(null);
                  }}
                  className="text-blue-600 hover:text-blue-800 font-semibold hover:underline"
                >
                  {selectedMois.mois}
                </button>
                <span className="text-gray-400">/</span>
                <span className="text-gray-900 font-bold">{selectedSemaine.label}</span>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900">Employés absents - {selectedSemaine.label}</h2>
            <p className="text-gray-600 mt-1">Du {selectedSemaine.dateDebut.toLocaleDateString('fr-FR')} au {selectedSemaine.dateFin.toLocaleDateString('fr-FR')}</p>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 font-medium">Employés absents</p>
              <p className="text-3xl font-bold text-gray-900">{selectedSemaine.total}</p>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-blue-600 font-medium">Congés Payés</p>
              <p className="text-3xl font-bold text-blue-900">{selectedSemaine.cp}</p>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <p className="text-sm text-red-600 font-medium">Arrêts Maladie</p>
              <p className="text-3xl font-bold text-red-900">{selectedSemaine.maladie}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <p className="text-sm text-purple-600 font-medium">Taux présence</p>
              <p className="text-3xl font-bold text-purple-900">
                {Math.round((1 - selectedSemaine.total / employes.filter(e => e.estActif).length) * 100)}%
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Liste des employés absents</h3>
            <div className="space-y-3">
              {absencesValidees
                .filter(a => selectedSemaine.absencesIds.includes(a.id))
                .map(absence => {
                  const employe = employes.find(e => e.id === absence.employeId);
                  return (
                    <div 
                      key={absence.id}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                          <User className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{employe?.nomComplet}</p>
                          <p className="text-sm text-gray-600">{employe?.societe}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          absence.type === 'CP' ? 'bg-blue-100 text-blue-800' :
                          absence.type === 'MALADIE' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {absence.type === 'CP' ? 'Congés Payés' : absence.type === 'MALADIE' ? 'Arrêt Maladie' : absence.type}
                        </span>
                        
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">
                            {new Date(absence.dateDebut).toLocaleDateString('fr-FR')} → {new Date(absence.dateFin).toLocaleDateString('fr-FR')}
                          </p>
                          <p className="text-xs text-gray-500">
                            {absence.dureeJours || 0} jour(s)
                          </p>
                        </div>

                        <button
                          onClick={() => window.open(`/rh/employes/${employe?.id}`, '_blank')}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                        >
                          Voir fiche
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="flex gap-3">
            <button 
              onClick={exportExcel}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center gap-2 transition-colors"
            >
              <FileSpreadsheet className="w-5 h-5" />
              Export Excel
            </button>
            <button 
              onClick={exportPDF}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 transition-colors"
            >
              <Download className="w-5 h-5" />
              Export PDF
            </button>
          </div>
        </motion.div>
      )}

      {/* Modal détails période */}
      {modalDetailed && selectedPeriod && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-y-auto p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                Détails Absences - {selectedPeriod.mois} {selectedPeriod.annee}
              </h2>
              <button 
                onClick={() => setModalDetailed(false)}
                className="text-gray-600 hover:text-gray-900"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-600 font-medium">Congés Payés</p>
                <p className="text-3xl font-bold text-blue-900">{selectedPeriod.cp}</p>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <p className="text-sm text-red-600 font-medium">Arrêts Maladie</p>
                <p className="text-3xl font-bold text-red-900">{selectedPeriod.maladie}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <p className="text-sm text-purple-600 font-medium">Total</p>
                <p className="text-3xl font-bold text-purple-900">
                  {selectedPeriod.cp + selectedPeriod.maladie}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Liste des absences
              </h3>
              {absencesDuMois.length > 0 ? (
                absencesDuMois.map(absence => {
                  const employe = employes.find(e => e.id === absence.employeId);
                  return (
                    <div key={absence.id} className="bg-gray-50 p-4 rounded-lg flex items-center justify-between hover:bg-gray-100 transition-colors">
                      <div>
                        <p className="font-semibold text-gray-900">{employe?.nomComplet || 'Inconnu'}</p>
                        <p className="text-sm text-gray-600">{employe?.societe || '—'}</p>
                      </div>
                      <div className="text-right">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          absence.type === 'CP' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {absence.type === 'CP' ? 'Congés Payés' : 'Arrêt Maladie'}
                        </span>
                        <p className="text-sm text-gray-600 mt-1">
                          {format(new Date(absence.dateDebut), 'dd/MM/yyyy', { locale: fr })} → 
                          {format(new Date(absence.dateFin), 'dd/MM/yyyy', { locale: fr })}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500 text-center py-4">Aucune absence pour ce mois</p>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal détails société */}
      {modalSociete && selectedSociete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-y-auto p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                Détails Absences - {selectedSociete}
              </h2>
              <button 
                onClick={() => setModalSociete(false)}
                className="text-gray-600 hover:text-gray-900"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-6">
              <p className="text-lg text-gray-700">
                Total absences : <span className="font-bold text-blue-600">{absencesSociete.length}</span>
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Liste des absences
              </h3>
              {absencesSociete.length > 0 ? (
                absencesSociete.map(absence => {
                  const employe = employes.find(e => e.id === absence.employeId);
                  return (
                    <div key={absence.id} className="bg-gray-50 p-4 rounded-lg flex items-center justify-between hover:bg-gray-100 transition-colors">
                      <div>
                        <p className="font-semibold text-gray-900">{employe?.nomComplet || 'Inconnu'}</p>
                        <p className="text-sm text-gray-600">{employe?.societe || '—'}</p>
                      </div>
                      <div className="text-right">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          absence.type === 'CP' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {absence.type === 'CP' ? 'Congés Payés' : 'Arrêt Maladie'}
                        </span>
                        <p className="text-sm text-gray-600 mt-1">
                          {format(new Date(absence.dateDebut), 'dd/MM/yyyy', { locale: fr })} → 
                          {format(new Date(absence.dateFin), 'dd/MM/yyyy', { locale: fr })}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500 text-center py-4">Aucune absence pour cette société</p>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal détails type */}
      {modalType && selectedType && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-y-auto p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                Détails Absences - {selectedType}
              </h2>
              <button 
                onClick={() => setModalType(false)}
                className="text-gray-600 hover:text-gray-900"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-6">
              <p className="text-lg text-gray-700">
                Total absences : <span className="font-bold text-blue-600">{absencesType.length}</span>
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Liste des absences
              </h3>
              {absencesType.length > 0 ? (
                absencesType.map(absence => {
                  const employe = employes.find(e => e.id === absence.employeId);
                  return (
                    <div key={absence.id} className="bg-gray-50 p-4 rounded-lg flex items-center justify-between hover:bg-gray-100 transition-colors">
                      <div>
                        <p className="font-semibold text-gray-900">{employe?.nomComplet || 'Inconnu'}</p>
                        <p className="text-sm text-gray-600">{employe?.societe || '—'}</p>
                      </div>
                      <div className="text-right">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          absence.type === 'CP' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {absence.type === 'CP' ? 'Congés Payés' : 'Arrêt Maladie'}
                        </span>
                        <p className="text-sm text-gray-600 mt-1">
                          {format(new Date(absence.dateDebut), 'dd/MM/yyyy', { locale: fr })} → 
                          {format(new Date(absence.dateFin), 'dd/MM/yyyy', { locale: fr })}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500 text-center py-4">Aucune absence de ce type</p>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

