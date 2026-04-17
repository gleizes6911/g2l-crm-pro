export const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  scales: { x: { display: false }, y: { display: false } },
  plugins: {
    legend: {
      display: true,
      position: 'bottom',
      labels: { color: '#475569', font: { size: 11 }, boxWidth: 10, padding: 8 },
    },
    tooltip: {
      backgroundColor: '#ffffff',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      titleColor: '#0f172a',
      bodyColor: '#475569',
    },
  },
  cutout: '60%',
}

export const doughnutOptionsRight = {
  responsive: true,
  maintainAspectRatio: false,
  scales: { x: { display: false }, y: { display: false } },
  plugins: {
    legend: {
      display: true,
      position: 'right',
      labels: { color: '#475569', font: { size: 11 }, boxWidth: 10, padding: 8 },
    },
    tooltip: {
      backgroundColor: '#ffffff',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      titleColor: '#0f172a',
      bodyColor: '#475569',
    },
  },
  cutout: '60%',
}

export const barOptions = (extraOptions = {}) => {
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: '#ffffff',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        titleColor: '#0f172a',
        bodyColor: '#475569',
        callbacks: {
          label: (ctx) => ` ${ctx.dataset.label} : ${Math.round(ctx.parsed.y).toLocaleString('fr-FR')} €`,
        },
      },
    },
    scales: {
      x: {
        ticks: { color: '#94a3b8', font: { size: 11 }, autoSkip: false, maxRotation: 0 },
        grid: { display: false },
        border: { display: false },
      },
      y: {
        ticks: { color: '#94a3b8', font: { size: 11 } },
        grid: { color: 'rgba(0,0,0,0.05)' },
        border: { display: false },
      },
    },
  }
  return {
    ...base,
    ...extraOptions,
    plugins: { ...base.plugins, ...(extraOptions.plugins || {}) },
    scales: { ...base.scales, ...(extraOptions.scales || {}) },
  }
}
