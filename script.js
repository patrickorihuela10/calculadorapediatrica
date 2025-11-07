// ---------------------------
// script.js — versão consolidada
// ---------------------------
Chart.defaults.devicePixelRatio = 2; // aumenta a nitidez, útil em tela cheia

let lms_0_5 = null;
let lms_5_19 = null;
let charts = { hfa: null, wfa: null, bfa: null };

Promise.all([
  fetch("data/lms_0_5.json").then(r => r.json()),
  fetch("data/lms_5_19.json").then(r => r.json())
]).then(([a, b]) => {
  lms_0_5 = a;
  lms_5_19 = b;
  console.log("✅ JSONs carregados.");
}).catch(e => console.error("Erro ao carregar JSONs:", e));

function calcularIdadeEmDias(nasc, aval) {
  return Math.floor((new Date(aval) - new Date(nasc)) / (1000 * 60 * 60 * 24));
}
function diasParaMeses(dias) { return dias / 30.4375; }
function mesesParaDias(meses) { return meses * 30.4375; }

function interpolar(idade, dados) {
  const ages = Object.keys(dados).map(k => parseFloat(k)).sort((a, b) => a - b);
  if (idade <= ages[0]) return dados[ages[0].toFixed(1)];
  if (idade >= ages[ages.length - 1]) return dados[ages[ages.length - 1].toFixed(1)];

  for (let i = 0; i < ages.length - 1; i++) {
    if (idade >= ages[i] && idade <= ages[i + 1]) {
      const d1 = dados[ages[i].toFixed(1)];
      const d2 = dados[ages[i + 1].toFixed(1)];
      const f = (idade - ages[i]) / (ages[i + 1] - ages[i]);
      return {
        L: d1.L + (d2.L - d1.L) * f,
        M: d1.M + (d2.M - d1.M) * f,
        S: d1.S + (d2.S - d1.S) * f
      };
    }
  }
  return null;
}

// === MODAL DE IMPRESSÃO ===
function abrirModalImpressao() {
  document.getElementById("modalImpressao").style.display = "block";
}

function fecharModalImpressao() {
  document.getElementById("modalImpressao").style.display = "none";
}

async function imprimirGraficos() {
  const altura = document.getElementById("printAltura").checked;
  const peso = document.getElementById("printPeso").checked;
  const imc = document.getElementById("printIMC").checked;

  const win = window.open("", "_blank");
  win.document.write(`
    <html>
    <head>
      <title>Relatório de Crescimento</title>
      <style>
        @page { size: landscape; margin: 12mm; }
        body { font-family: sans-serif; text-align: center; background: #fff; }
        img {
          max-width: 95%;
          height: auto;
          margin: 25px auto;
          display: block;
          page-break-before: always;
          page-break-inside: avoid;
        }
        img:first-of-type { page-break-before: auto; }
        h1 { color: #2e7d32; margin-bottom: 0; }
        p { margin-top: 5px; color: #555; }
      </style>
    </head>
    <body>
      <h1>Relatório de Crescimento</h1>
      <p>Gerado em ${new Date().toLocaleDateString()}</p>
  `);

  // função auxiliar → gera imagem em alta resolução
  async function gerarImagemAltaRes(chart) {
    const canvas = document.createElement("canvas");
    const ratio = 4; // multiplica DPI
    canvas.width = chart.canvas.clientWidth * ratio;
    canvas.height = chart.canvas.clientHeight * ratio;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);

    // Clona a configuração do gráfico original
    const clone = new Chart(ctx, {
      type: chart.config.type,
      data: chart.config.data,
      options: {
        ...chart.config.options,
        animation: false,
        responsive: false,
        maintainAspectRatio: false,
      },
    });

    // aguarda renderizar
    await new Promise(res => setTimeout(res, 300));
    const imgData = canvas.toDataURL("image/png");
    clone.destroy();
    return imgData;
  }

  // Gera e insere apenas os gráficos selecionados
  if (altura && charts.hfa)
    win.document.write(`<img src="${await gerarImagemAltaRes(charts.hfa)}" alt="Altura para idade">`);
  if (peso && charts.wfa)
    win.document.write(`<img src="${await gerarImagemAltaRes(charts.wfa)}" alt="Peso para idade">`);
  if (imc && charts.bfa)
    win.document.write(`<img src="${await gerarImagemAltaRes(charts.bfa)}" alt="IMC para idade">`);

  win.document.write(`</body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 700);
  fecharModalImpressao();
}





function getLMSFor(sexo, tipo, idadeMeses, idadeDias) {
  if (!lms_0_5 || !lms_5_19) return null;
  if (idadeMeses <= 60) {
    const dados = lms_0_5[sexo][tipo];
    return interpolar(idadeDias, dados);
  } else {
    const dados = lms_5_19[sexo][tipo];
    return interpolar(idadeMeses, dados);
  }
}

function sdAt(L, M, S, z) {
  if (Math.abs(L) < 1e-9) return M * Math.exp(S * z);
  return M * Math.pow(1 + L * S * z, 1 / L);
}
function calcZ(x, L, M, S) {
  if (!L || !M || !S) return NaN;
  return ((x / M) ** L - 1) / (L * S);
}

function calcTargetRange(sexo, pai, mae) {
  const med = sexo === "male" ? (pai + mae + 13) / 2 : (pai + mae - 13) / 2;
  return { min: med - 6.5, med, max: med + 6.5 };
}

/**
 * interpretarZ(z, tipo, idadeMeses, imcValor = null)
 * - z: z-score calculado (pode ser NaN)
 * - tipo: "altura" | "peso" | "imc"
 * - idadeMeses: idade em meses (usada para decidir faixa)
 * - imcValor: valor absoluto do IMC (usado para classificação adulta)
 *
 * Retorna: string de interpretação clínica.
 */
function interpretarZ(z, tipo, idadeMeses, imcValor = null) {
  if (tipo === "altura") {
    if (isNaN(z)) return "-";
    if (z < -3) return "Muito baixa estatura";
    if (z < -2) return "Baixa estatura";
    return "Estatura adequada";
  }

  if (tipo === "peso") {
    if (isNaN(z)) return "-";
    if (z < -3) return "Muito baixo peso";
    if (z < -2) return "Baixo peso";
    if (z <= 2) return "Peso adequado";
    return "Peso elevado";
  }

  if (tipo === "imc") {
    // Se for adulto (>= 19 anos) e tivermos IMC absoluto, usar classificação adulta
    const idadeAnos = idadeMeses / 12;
    if (idadeAnos >= 19 && imcValor !== null) {
      if (imcValor < 18.5) return "Baixo peso";
      if (imcValor < 25) return "Eutrófico";
      if (imcValor < 30) return "Sobrepeso";
      if (imcValor < 35) return "Obesidade grau I";
      if (imcValor < 40) return "Obesidade grau II";
      return "Obesidade grau III";
    }

    // Se criança/adolescente (OMS)
    if (isNaN(z)) return "-";
    if (idadeMeses <= 60) {
      if (z < -3) return "Magreza acentuada";
      if (z < -2) return "Magreza";
      if (z <= 1) return "Eutrófico";
      if (z <= 2) return "Risco de sobrepeso";
      return "Obesidade";
    } else {
      if (z < -3) return "Magreza acentuada";
      if (z < -2) return "Magreza";
      if (z <= 1) return "Eutrófico";
      if (z <= 2) return "Sobrepeso";
      if (z <= 3) return "Obesidade";
      return "Obesidade grave";
    }
  }

  return "-";
}

const zColors = {
  '-3': '#000', '-2': '#e53935', '-1': '#fb8c00', '0': '#43a047',
   '1': '#fb8c00', '2': '#e53935', '3': '#000'
};

function refLines(sexo, tipo, maxMeses, step = 1) {
  const ages = [];
  for (let i = 0; i <= maxMeses; i += step) ages.push(i);
  const lines = {};
  for (let z = -3; z <= 3; z++) lines[z] = [];

  const d0 = lms_0_5?.[sexo]?.[tipo];
  const d1 = lms_5_19?.[sexo]?.[tipo];
  for (const a of ages) {
    const lms = a <= 60 ? interpolar(a * 30.4375, d0) : interpolar(a, d1);
    if (!lms) continue;
    for (let z = -3; z <= 3; z++)
      lines[z].push({ x: a, y: sdAt(lms.L, lms.M, lms.S, z) });
  }

  return Object.keys(lines).map(z => ({
    label: `Z=${z}`,
    data: lines[z],
    borderColor: zColors[z],
    borderWidth: z == 0 ? 2 : 1,
    pointRadius: 0,
    showLine: true,
    tension: 0.25
  }));
}


function enableFullscreenToggle(canvasId, sexo, tipo, maxMeses, child, target) {
  const canvas = document.getElementById(canvasId);
  const container = canvas.closest(".chart-container");
  const chart = Object.values(charts).find(c => c?.canvas === canvas);
  if (!canvas || !chart) return;

  let wasFullscreen = false;
  let savedHeight = container.style.height;

  async function enterFullscreen() {
    wasFullscreen = true;
    savedHeight = container.style.height;
    container.classList.add("fullscreen");

    try {
      await container.requestFullscreen();
    } catch (e) {
      console.warn("Fullscreen não suportado:", e);
    }

    // Redimensiona gráfico com DPI ajustado
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    chart.resize();
    chart.update("none");
  }

  function exitFullscreen() {
    container.classList.remove("fullscreen");
    container.style.height = savedHeight || "400px";

    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    chart.resize();
    chart.update("none");

    wasFullscreen = false;
  }

  // Evento de clique para alternar
  container.addEventListener("click", () => {
    if (!wasFullscreen) {
      enterFullscreen();
    } else {
      if (document.fullscreenElement) document.exitFullscreen();
      exitFullscreen();
    }
  });

  // Captura ESC / saída manual
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && wasFullscreen) {
      exitFullscreen();
    }
  });
}




function plotAllCharts(sexo, idadeMeses, idadeDias, child, target) {
  // === ALTURA ===
  const ctxH = document.getElementById("graficoHFA").getContext("2d");
  if (charts.hfa) charts.hfa.destroy();
  const refH = refLines(sexo, "height", 228);

  // Faixa alvo estatural (linhas que acompanham o z-score do alvo)
  const targetDatasets = [];
  if (target && target.z) {
    const inf = [], sup = [];
    for (let i = 0; i <= 228; i++) {
      const lms = getLMSFor(sexo, "height", i, mesesParaDias(i));
      if (!lms) continue;
      const yInf = sdAt(lms.L, lms.M, lms.S, target.z.inf);
      const ySup = sdAt(lms.L, lms.M, lms.S, target.z.sup);
      inf.push({ x: i, y: yInf });
      sup.push({ x: i, y: ySup });
    }
    targetDatasets.push({
      label: "Alvo inferior",
      data: inf,
      borderColor: "rgba(255,165,0,0.9)",
      borderDash: [6, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      showLine: true,
      fill: "+1",
      backgroundColor: "rgba(255,165,0,0.12)"
    });
    targetDatasets.push({
      label: "Alvo superior",
      data: sup,
      borderColor: "rgba(255,165,0,0.9)",
      borderDash: [6, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      showLine: true,
      fill: false
    });
  }

  const childPoint = {
    label: "Criança",
    data: [{ x: Number(idadeMeses), y: Number(child.altura) }],
    backgroundColor: "blue",
    borderColor: "blue",
    pointRadius: 6,
    showLine: false
  };

  charts.hfa = new Chart(ctxH, {
    type: "line",
    data: { datasets: [...refH, ...targetDatasets, childPoint] },
    options: {maintainAspectRatio: false,
      responsive: true,
      parsing: false,
      scales: {
        x: {
  type: "linear",
  title: { display: true, text: "Idade (anos/meses)" },
  min: 0,
  max: 228,
  ticks: {
    callback: function (value) {
      const anos = Math.floor(value / 12);
      const meses = value % 12;
      if (meses === 0) return `${anos}a`;     // Exibe 0, 12, 24, 36... como “0a”, “1a”, etc.
      if (meses === 6) return `${anos}a${meses}m`; // Exibe 6, 18, 30... como “0a6m”, “1a6m”
      return ""; // omite outros meses pra não poluir
    },
    stepSize: 6 // mostra a cada 6 meses
  }
}
,
        y: { title: { display: true, text: "Altura (cm)" }, min: 40, max: 200 }
      },
      plugins: {
  legend: { position: "bottom" },
  title: {
    display: true,
    text: "Altura para Idade", // título que aparece acima do gráfico
    font: { size: 16, weight: 'bold' },
    color: "#333",
    padding: { top: 10, bottom: 10 }
  }
}

    }
  });
  enableFullscreenToggle("graficoHFA", sexo, "height", 228, { idadeMeses, valor: child.altura }, target);

  // === PESO ===
  const ctxW = document.getElementById("graficoWFA").getContext("2d");
  if (charts.wfa) charts.wfa.destroy();
  const refW = refLines(sexo, "weight", 120);
  const childW = { label: "Criança", data: [{ x: Number(idadeMeses), y: Number(child.peso) }],
    backgroundColor: "green", borderColor: "green", pointRadius: 6, showLine: false };
  charts.wfa = new Chart(ctxW, {
    type: "line",
    data: { datasets: [...refW, childW] },
    options: {maintainAspectRatio: false,
      responsive: true, parsing: false,
      scales: {
        x: {
  type: "linear",
  title: { display: true, text: "Idade (anos/meses)" },
  min: 0,
  max: 120,
  ticks: {
    callback: function (value) {
      const anos = Math.floor(value / 12);
      const meses = value % 12;
      if (meses === 0) return `${anos}a`;     // Exibe 0, 12, 24, 36... como “0a”, “1a”, etc.
      if (meses === 6) return `${anos}a${meses}m`; // Exibe 6, 18, 30... como “0a6m”, “1a6m”
      return ""; // omite outros meses pra não poluir
    },
    stepSize: 6 // mostra a cada 6 meses
  }
}
,
        y: { title: { display: true, text: "Peso (kg)" }, min: 2, max: 70 }
      },
      plugins: {
  legend: { position: "bottom" },
  title: {
    display: true,
    text: "Peso para Idade", // título que aparece acima do gráfico
    font: { size: 16, weight: 'bold' },
    color: "#333",
    padding: { top: 10, bottom: 10 }
  }
}

    }
  });
  enableFullscreenToggle("graficoWFA", sexo, "weight", 120, { idadeMeses, valor: child.peso }, target);

  // === IMC ===
  const ctxB = document.getElementById("graficoBFA").getContext("2d");
  if (charts.bfa) charts.bfa.destroy();
  const refB = refLines(sexo, "bmi", 228);
  const childB = { label: "Criança", data: [{ x: Number(idadeMeses), y: Number(child.imc) }],
    backgroundColor: "purple", borderColor: "purple", pointRadius: 6, showLine: false };

  charts.bfa = new Chart(ctxB, {
    type: "line",
    data: { datasets: [...refB, childB] },
    options: {maintainAspectRatio: false,
      responsive: true, parsing: false,
      scales: {
        x: {
  type: "linear",
  title: { display: true, text: "Idade (anos/meses)" },
  min: 0,
  max: 228,
  ticks: {
    callback: function (value) {
      const anos = Math.floor(value / 12);
      const meses = value % 12;
      if (meses === 0) return `${anos}a`;     // Exibe 0, 12, 24, 36... como “0a”, “1a”, etc.
      if (meses === 6) return `${anos}a${ meses}m`; // Exibe 6, 18, 30... como “0a6m”, “1a6m”
      return ""; // omite outros meses pra não poluir
    },
    stepSize: 6 // mostra a cada 6 meses
  }
}
,
        y: { title: { display: true, text: "IMC (kg/m²)" }, min: 10, max: 40 }
      },
      plugins: {
  legend: { position: "bottom" },
  title: {
    display: true,
    text: "IMC para Idade", // título que aparece acima do gráfico
    font: { size: 16, weight: 'bold' },
    color: "#333",
    padding: { top: 10, bottom: 10 }
  }
}

    }
  });
  enableFullscreenToggle("graficoBFA", sexo, "bmi", 228, { idadeMeses, valor: child.imc }, target);
}

function upgradeChartForFullscreen(chartObj, sexo, tipo, maxMeses, child, target) {
  // recria as linhas com densidade 4x maior
  const ref = refLines(sexo, tipo, maxMeses, 0.25);

  // reduz o tamanho do ponto da criança
  const childUp = {
    label: "Criança",
    data: [{ x: child.idadeMeses, y: child.valor }],
    backgroundColor: chartObj.data.datasets.at(-1)?.backgroundColor || "blue",
    borderColor: "blue",
    pointRadius: 4,
    showLine: false
  };

  // substitui datasets
  chartObj.data.datasets = [...ref, childUp];

  // melhora resolução do canvas
  const canvas = chartObj.canvas;
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 2; // aumenta o DPI
  canvas.width = canvas.clientWidth * ratio;
  canvas.height = canvas.clientHeight * ratio;
  ctx.scale(ratio, ratio);

  chartObj.update();
}


function calcular() {
  const nasc = document.getElementById("nascimento").value;
  let aval = document.getElementById("avaliacao").value;
  const sexo = document.getElementById("sexo").value;
  const peso = parseFloat(document.getElementById("peso").value);
  const altura = parseFloat(document.getElementById("altura").value);
  const pai = parseFloat(document.getElementById("alturaPai").value);
  const mae = parseFloat(document.getElementById("alturaMae").value);

  // se o campo estiver vazio, usa a data atual
  if (!aval) {
    const hoje = new Date();
    const yyyy = hoje.getFullYear();
    const mm = String(hoje.getMonth() + 1).padStart(2, "0");
    const dd = String(hoje.getDate()).padStart(2, "0");
    aval = `${yyyy}-${mm}-${dd}`;
  }

  // checa apenas nascimento + medidas
  if (!nasc || isNaN(peso) || isNaN(altura)) {
    alert("Preencha a data de nascimento, peso e altura.");
    return;
  }

  const idadeDias = calcularIdadeEmDias(nasc, aval);
  const idadeMeses = diasParaMeses(idadeDias);
  const anos = (idadeMeses / 12).toFixed(1);

  const LMS_h = getLMSFor(sexo, "height", idadeMeses, idadeDias);
  const LMS_w = getLMSFor(sexo, "weight", idadeMeses, idadeDias);
  const LMS_b = getLMSFor(sexo, "bmi", idadeMeses, idadeDias);
  if (!LMS_h || !LMS_b) {
    alert("Sem dados OMS para essa idade.");
    return;
  }

  const imc = peso / ((altura / 100) ** 2);
  const zH = calcZ(altura, LMS_h.L, LMS_h.M, LMS_h.S);
  const zW = LMS_w ? calcZ(peso, LMS_w.L, LMS_w.M, LMS_w.S) : NaN;
  const zB = calcZ(imc, LMS_b.L, LMS_b.M, LMS_b.S);

  let target = null;
  if (!isNaN(pai) && !isNaN(mae)) {
    const cm = calcTargetRange(sexo, pai, mae);
    const LMS19 = getLMSFor(sexo, "height", 228, mesesParaDias(228));
    const zMed = calcZ(cm.med, LMS19.L, LMS19.M, LMS19.S);
    const zInf = calcZ(cm.min, LMS19.L, LMS19.M, LMS19.S);
    const zSup = calcZ(cm.max, LMS19.L, LMS19.M, LMS19.S);
    target = { cm, z: { med: zMed, inf: zInf, sup: zSup } };
  }

 // Monta relatório textual
const idadeAnos = idadeMeses / 12;
let texto = [
  `Idade: ${Math.round(idadeDias)} dias • ${idadeMeses.toFixed(1)} meses • ${anos} anos`,
  `Altura: ${altura.toFixed(1)} cm → Z = ${isNaN(zH) ? '-' : zH.toFixed(2)} (${interpretarZ(zH, "altura", idadeMeses)})`
];

// Peso: só mostra Z e diagnóstico até 10 anos (120 meses)
if (idadeMeses <= 120 && !isNaN(zW)) {
  texto.push(`Peso: ${peso.toFixed(1)} kg → Z = ${zW.toFixed(2)} (${interpretarZ(zW, "peso", idadeMeses)})`);
} else {
  texto.push(`Peso: ${peso.toFixed(1)} kg`);
}

// IMC: omite Z em adultos (>=19 anos)
if (idadeAnos >= 19) {
  texto.push(`IMC: ${imc.toFixed(2)} → ${interpretarZ(zB, "imc", idadeMeses, imc)}`);
} else if (!isNaN(zB) && Math.abs(zB) <= 3) {
  texto.push(`IMC: ${imc.toFixed(2)} → Z = ${zB.toFixed(2)} (${interpretarZ(zB, "imc", idadeMeses, imc)})`);
} else {
  texto.push(`IMC: ${imc.toFixed(2)} → ${interpretarZ(zB, "imc", idadeMeses, imc)}`);
}

if (target) {
  texto.push(
    `Alvo estatural: ${target.cm.med.toFixed(1)} cm (${target.cm.min.toFixed(1)}–${target.cm.max.toFixed(1)} cm)` +
    ` → Z = ${isNaN(target.z.med) ? '-' : target.z.med.toFixed(2)} ` +
    `[${isNaN(target.z.inf) ? '-' : target.z.inf.toFixed(2)} a ${isNaN(target.z.sup) ? '-' : target.z.sup.toFixed(2)}]`
  );
}

document.getElementById("resultado").innerText = texto.join("\n");


  plotAllCharts(sexo, idadeMeses, idadeDias, { altura, peso, imc }, target);
}

/// === AUMENTA RESOLUÇÃO E DETALHAMENTO NA IMPRESSÃO ===
window.addEventListener("beforeprint", () => {
  try {
    const sexo = document.getElementById("sexo").value;
    const nasc = document.getElementById("nascimento").value;
    let aval = document.getElementById("avaliacao").value;
    if (!aval) aval = new Date().toISOString().split("T")[0];

    const idadeDias = calcularIdadeEmDias(nasc, aval);
    const idadeMeses = diasParaMeses(idadeDias);

    // valores atuais
    const peso = parseFloat(document.getElementById("peso").value);
    const altura = parseFloat(document.getElementById("altura").value);
    const imc = peso / ((altura / 100) ** 2);
    const pai = parseFloat(document.getElementById("alturaPai").value);
    const mae = parseFloat(document.getElementById("alturaMae").value);

    let target = null;
    if (!isNaN(pai) && !isNaN(mae)) {
      const cm = calcTargetRange(sexo, pai, mae);
      const LMS19 = getLMSFor(sexo, "height", 228, mesesParaDias(228));
      const zMed = calcZ(cm.med, LMS19.L, LMS19.M, LMS19.S);
      const zInf = calcZ(cm.min, LMS19.L, LMS19.M, LMS19.S);
      const zSup = calcZ(cm.max, LMS19.L, LMS19.M, LMS19.S);
      target = { cm, z: { med: zMed, inf: zInf, sup: zSup } };
    }

    // recria gráficos com mais pontos, mantendo o eixo X padrão
    Object.entries(charts).forEach(([tipo, chart]) => {
      if (!chart) return;
      let maxMeses = tipo === "wfa" ? 120 : 228;
      let tipoLms = tipo === "hfa" ? "height" : tipo === "wfa" ? "weight" : "bmi";
      let valor = tipo === "hfa" ? altura : tipo === "wfa" ? peso : imc;

      // recria apenas as linhas com passo menor (curvas mais suaves)
      const ref = refLines(sexo, tipoLms, maxMeses, 0.25);

      // substitui os datasets mantendo eixo X (6 meses)
      const ponto = {
        label: "Criança",
        data: [{ x: idadeMeses, y: valor }],
        backgroundColor: "blue",
        borderColor: "blue",
        pointRadius: 4,
        showLine: false
      };

      chart.data.datasets = [...ref, ponto];
      chart.options.scales.x.ticks.stepSize = 6;
      chart.options.scales.x.ticks.callback = (v) => {
        const anos = Math.floor(v / 12);
        const meses = v % 12;
        if (meses === 0) return `${anos}a`;
        if (meses === 6) return `${anos}a6m`;
        return "";
      };

      // aumenta o DPI e atualiza
      const canvas = chart.canvas;
      const ctx = canvas.getContext("2d");
      const ratio = 3; // aumenta a definição
      canvas.width = canvas.clientWidth * ratio;
      canvas.height = canvas.clientHeight * ratio;
      ctx.scale(ratio, ratio);
      chart.update("none");
    });

  } catch (e) {
    console.error("Erro ao preparar gráficos para impressão:", e);
  }
});



// Expor função ao HTML
window.calcular = calcular;
