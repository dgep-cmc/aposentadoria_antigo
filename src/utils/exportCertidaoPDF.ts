import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CMC_LOGO_BASE64, CMC_LOGO_ASPECT_RATIO } from './cmcLogo';

export interface TempoItem {
  anos: number;
  meses: number;
  dias: number;
  totalDias: number;
  periodoDesc?: string;
  obs?: string;
}

export interface CertidaoData {
  numeroCertidao: string; // Ex: "03/2026" ou "SIMULAÇÃO"
  dataCertidao: string; // Ex: "22/10/2026"
  isSimulacao?: boolean; // Se true, gera como Certidão de Simulação (sem controle numérico)
  tipoCertidao?: 'aposentadoria' | 'abono_permanencia';
  
  // Dados do Servidor
  servidor: {
    nome: string;
    rg: string;
    cpf: string;
    sexo: 'Masculino' | 'Feminino';
    matricula: string;
    dataNascimento: string;
    idadeHoje: number;
    idadeEm31Dez2021: number;
    orgao: string; // "Câmara Municipal de Curitiba"
    cargo: string; // "Analista Legislativo"
    padrao: string; // "306"
    referencia: string; // "XXXVI"
    dataAdmissaoServicoPublico: string; // "27/06/1988"
    dataAdmissaoEstatutario: string; // "02/10/1993"
    dataRequerimento: string; // "19/10/2025"
    registroTribunalContas: string; // "402750/03 - Resolução nº 8253/2003"
  };

  // Marcos temporais
  marcos: {
    diasAteEmissao: number;
    diasAte31Dez2021: number;
    diferencaDias: number;
  };

  // Grade de Tempo de Serviço / Contribuição
  gradeTempo: {
    tempoEstatutarioCMC: TempoItem;
    tempoFictoLicencaPremio: TempoItem;
    tempoServicoPublicoRecibado: TempoItem;
    tempoServicoPublicoCLT: TempoItem;
    outrasIncorporacoesEstatutario: TempoItem;
    outrasIncorporacoesCLT: TempoItem;
    afastamentosSemVencimento: TempoItem;
    penalidadesAdministrativas: TempoItem;
    tempoTotalServicoPublico: TempoItem;
    tempoINSSPrivada: TempoItem;
    tempoTotalServicoContribuicao: TempoItem;
  };

  // Tempos de exercício
  temposExercicio: {
    servicoPublicoTotal: TempoItem;
    cargoEfetivoTotal: TempoItem;
  };

  // Informações para regras transitórias
  regrasTransitorias: {
    atsPercentual: number;
    recebeAbono: boolean;
    dataAbono: string;
    idadeEm31Dez2021: number;
    tempoEm31Dez2021Anos: number;
  };

  // Lavratura
  lavratura: {
    cidade: string;
    data: string;
    servidorNome: string;
    servidorMatricula: string;
    setor: string;
  };

  // Dados para Envio ao Órgão Previdenciário (IPMC)
  dadosIPMC?: {
    numeroProcessoSEI: string;
    orgaoDestino: string;
    regraSugerida: string;
    tipoProventos: string;
    valorProventosEstimados: number;
    valorATS: number;
    valorGratificacaoEspecial: number;
    despachoFinalidade: string;
    observacoesGerais?: string;
  };
}

// Formatador de moedas
const formatCurrency = (val: number | undefined): string => {
  if (val === undefined || isNaN(val)) return '0,00';
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Formatador de número com separador de milhar
const formatNumber = (val: number | undefined): string => {
  if (val === undefined || isNaN(val)) return '0';
  return val.toLocaleString('pt-BR');
};

/**
 * Gera a Certidão Oficial de Aposentadoria (Padrão DGEP/CMC)
 * Segue estritamente a estrutura oficial do Setor de Gestão de Processos e Benefícios Funcionais
 */
export function gerarCertidaoAposentadoriaPadraoPDF(data: CertidaoData): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2; // 186 mm
  let currentY = 8.5;

  const isSimulacao = Boolean(
    data.isSimulacao || 
    data.numeroCertidao?.toUpperCase().includes('SIMULAÇÃO') || 
    data.numeroCertidao?.toUpperCase().includes('MINUTA')
  );

  // Marca d'água institucional suave de simulação para a certidão sem controle numérico
  if (isSimulacao) {
    doc.saveGraphicsState();
    doc.setTextColor(242, 244, 248);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(44);
    doc.text('SIMULAÇÃO — MINUTA', pageWidth / 2, pageHeight / 2, {
      align: 'center',
      angle: 35
    });
    doc.restoreGraphicsState();
  }

  // Cores Padronizadas Institucionais CMC / DGEP
  const COLOR_PRIMARY = [0, 47, 90];        // Azul CMC Institucional (#002F5A)
  const COLOR_TEXT = [20, 25, 35];           // Preto/grafite institucional para dados e informações
  const COLOR_SUBTEXT = [50, 55, 65];        // Subtítulos e dados secundários
  const COLOR_BORDER = [195, 202, 215];      // Linhas de grade e bordas
  const COLOR_HIGHLIGHT = [240, 245, 252];   // Fundo de destaque para subtotais e cabeçalhos secundários
  const COLOR_TOTAL = [226, 239, 251];       // Fundo de destaque para total geral

  // -----------------------------------------------------------------
  // CABEÇALHO UNIFICADO INSTITUCIONAL CMC / DGEP
  // -----------------------------------------------------------------
  const logoW = 38;
  const logoH = logoW / CMC_LOGO_ASPECT_RATIO; // ~14.77 mm
  const headerTotalH = 26.5; // Altura total do cabeçalho integrado
  const headerTopH = 17.5;   // Parte superior institucional
  const headerBottomH = 9.0; // Faixa de título da certidão

  const headerBorderColor = isSimulacao ? [217, 119, 6] : COLOR_PRIMARY;

  // Caixa externa unificada institucional
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(headerBorderColor[0], headerBorderColor[1], headerBorderColor[2]);
  doc.setLineWidth(0.35);
  doc.roundedRect(margin, currentY, contentWidth, headerTotalH, 1.2, 1.2, 'S');

  // Friso superior institucional
  doc.setFillColor(headerBorderColor[0], headerBorderColor[1], headerBorderColor[2]);
  doc.rect(margin, currentY, contentWidth, 1.8, 'F');

  // Adiciona a Logomarca Oficial da CMC (Palácio Rio Branco + texto "Câmara de Curitiba")
  doc.addImage(CMC_LOGO_BASE64, 'PNG', margin + 3.2, currentY + 2.0, logoW, logoH);

  // Linha vertical divisória sutil
  doc.setDrawColor(210, 215, 225);
  doc.setLineWidth(0.2);
  doc.line(margin + logoW + 5.5, currentY + 2.5, margin + logoW + 5.5, currentY + 16.5);

  // Identificação Institucional
  const textX = margin + logoW + 9.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(COLOR_PRIMARY[0], COLOR_PRIMARY[1], COLOR_PRIMARY[2]);
  doc.text('DIRETORIA DE GESTÃO DE PESSOAS — DGEP', textX, currentY + 7.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(COLOR_SUBTEXT[0], COLOR_SUBTEXT[1], COLOR_SUBTEXT[2]);
  doc.text('Setor de Gestão de Processos e Benefícios Funcionais • Certidão de Tempo de Contribuição', textX, currentY + 13.0);

  // Linha divisória horizontal interna entre identificação institucional e título
  doc.setDrawColor(headerBorderColor[0], headerBorderColor[1], headerBorderColor[2]);
  doc.setLineWidth(0.25);
  doc.line(margin, currentY + headerTopH, margin + contentWidth, currentY + headerTopH);

  // Faixa inferior integrada de Título da Certidão
  const titleY = currentY + headerTopH;
  const isAbono = data.tipoCertidao === 'abono_permanencia';
  if (isSimulacao) {
    doc.setFillColor(254, 249, 235);
    doc.rect(margin, titleY, contentWidth, headerBottomH, 'F');

    doc.setTextColor(146, 64, 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isAbono ? 9.5 : 10.0);
    doc.text(isAbono ? 'CERTIDÃO DE ABONO DE PERMANÊNCIA — MINUTA' : 'CERTIDÃO DE APOSENTADORIA — MINUTA DE SIMULAÇÃO', margin + 4.5, titleY + 5.8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.0);
    doc.text(`SEM CONTROLE NUMÉRICO   •   Data: ${data.dataCertidao}`, pageWidth - margin - 4.5, titleY + 5.8, { align: 'right' });
  } else {
    doc.setFillColor(238, 244, 252);
    doc.rect(margin, titleY, contentWidth, headerBottomH, 'F');

    doc.setTextColor(COLOR_PRIMARY[0], COLOR_PRIMARY[1], COLOR_PRIMARY[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isAbono ? 9.8 : 10.5);
    doc.text(isAbono ? `CERTIDÃO DE ABONO DE PERMANÊNCIA Nº ${data.numeroCertidao.toUpperCase()}` : `CERTIDÃO DE APOSENTADORIA Nº ${data.numeroCertidao.toUpperCase()}`, margin + 4.5, titleY + 5.8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(`Data: ${data.dataCertidao}`, pageWidth - margin - 4.5, titleY + 5.8, { align: 'right' });
  }

  currentY += headerTotalH + 5.0; // ~40.0 mm

  // BLOCO 1: DADOS DO SERVIDOR
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(COLOR_PRIMARY[0], COLOR_PRIMARY[1], COLOR_PRIMARY[2]);
  doc.text('1. DADOS DO SERVIDOR', margin, currentY);
  currentY += 3.2;

  const colServidorWidth = contentWidth / 4; // 46.5 mm
  const dadosServidorTable = [
    [
      { content: `NOME DO(A) SERVIDOR(A)\n${data.servidor.nome}`, colSpan: 2, styles: { fontStyle: 'bold' } },
      { content: `RG\n${data.servidor.rg}`, styles: { fontStyle: 'bold' } },
      { content: `CPF\n${data.servidor.cpf}`, styles: { fontStyle: 'bold' } }
    ],
    [
      { content: `DATA DE NASCIMENTO\n${data.servidor.dataNascimento}`, styles: { fontStyle: 'bold' } },
      { content: `SEXO\n${data.servidor.sexo}`, styles: { fontStyle: 'bold' } },
      { content: `MATRÍCULA FUNCIONAL\n${data.servidor.matricula}`, styles: { fontStyle: 'bold' } },
      { content: `IDADE ATUAL\n${data.servidor.idadeHoje} anos`, styles: { fontStyle: 'bold' } }
    ],
    [
      { content: `CARGO EFETIVO\n${data.servidor.cargo}`, colSpan: 2, styles: { fontStyle: 'bold' } },
      { content: `PADRÃO / REFERÊNCIA\n${data.servidor.padrao} / ${data.servidor.referencia}`, styles: { fontStyle: 'bold' } },
      { content: `DATA DE ADMISSÃO\n${data.servidor.dataAdmissaoServicoPublico}`, styles: { fontStyle: 'bold' } }
    ],
    [
      { 
        content: `REGISTRO DE ADMISSÃO TCE-PR\n${data.servidor.registroTribunalContas || 'Sem registro / Em tramitação'}`, 
        colSpan: 4,
        styles: { fontStyle: 'italic' } 
      }
    ]
  ];

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    body: dadosServidorTable as any,
    theme: 'grid',
    styles: {
      fontSize: 8.0,
      cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 },
      textColor: COLOR_TEXT as any,
      lineColor: COLOR_BORDER as any,
      lineWidth: 0.15
    },
    columnStyles: {
      0: { cellWidth: colServidorWidth },
      1: { cellWidth: colServidorWidth },
      2: { cellWidth: colServidorWidth },
      3: { cellWidth: colServidorWidth }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 4.5;

  // BLOCO 2: GRADE DE TEMPO DE SERVIÇO / CONTRIBUIÇÃO
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(COLOR_PRIMARY[0], COLOR_PRIMARY[1], COLOR_PRIMARY[2]);
  doc.text('2. GRADE DE TEMPO DE SERVIÇO / CONTRIBUIÇÃO', margin, currentY);
  currentY += 3.2;

  const g = data.gradeTempo;

  const formatItemRow = (
    descricao: string, 
    item: TempoItem, 
    isTotal = false, 
    isSubtotal = false, 
    subtext?: string
  ) => {
    const mainContent = subtext ? `${descricao}\n${subtext}` : descricao;
    const isHighlight = isTotal || isSubtotal;
    const bgFill = isTotal ? COLOR_TOTAL : (isSubtotal ? COLOR_HIGHLIGHT : undefined);
    const txtColor = isHighlight ? COLOR_PRIMARY : COLOR_TEXT;
    const rowFontSize = isTotal ? 8.0 : (isSubtotal ? 7.8 : 7.5);

    return [
      { 
        content: mainContent, 
        styles: { 
          fontStyle: isHighlight ? 'bold' : 'normal',
          fillColor: bgFill as any,
          textColor: txtColor as any,
          fontSize: rowFontSize
        } 
      },
      { 
        content: String(item.anos), 
        styles: { 
          halign: 'center', 
          fontStyle: isHighlight ? 'bold' : 'normal', 
          fillColor: bgFill as any,
          textColor: txtColor as any,
          fontSize: rowFontSize
        } 
      },
      { 
        content: String(item.meses), 
        styles: { 
          halign: 'center', 
          fontStyle: isHighlight ? 'bold' : 'normal', 
          fillColor: bgFill as any,
          textColor: txtColor as any,
          fontSize: rowFontSize
        } 
      },
      { 
        content: String(item.dias), 
        styles: { 
          halign: 'center', 
          fontStyle: isHighlight ? 'bold' : 'normal', 
          fillColor: bgFill as any,
          textColor: txtColor as any,
          fontSize: rowFontSize
        } 
      },
      { 
        content: formatNumber(item.totalDias), 
        styles: { 
          halign: 'right', 
          fontStyle: 'bold', 
          fillColor: bgFill as any, 
          textColor: txtColor as any,
          fontSize: rowFontSize
        } 
      }
    ];
  };

  const gradeTableBody = [
    // 1. Tempo Estatutário na CMC
    formatItemRow(
      `Tempo Estatutário na CMC ${g.tempoEstatutarioCMC.periodoDesc ? `(${g.tempoEstatutarioCMC.periodoDesc.replace(/^\(|\)$/g, '')}):` : ':'}`,
      g.tempoEstatutarioCMC
    ),
    // 2. Tempo Fícto (licenças-prêmio incorporadas – CMC)
    formatItemRow(
      'Tempo Fícto (licenças-prêmio incorporadas – CMC):',
      g.tempoFictoLicencaPremio
    ),
    // 3. Tempo de Serviço Público Municipal (Recibado) incorporado
    formatItemRow(
      'Tempo de Serviço Público Municipal (Recibado) incorporado:',
      g.tempoServicoPublicoRecibado
    ),
    // 4. Tempo de Serviço Público Municipal (CLT) incorporado
    formatItemRow(
      `Tempo de Serviço Público Municipal (CLT) incorporado ${g.tempoServicoPublicoCLT.periodoDesc ? `(${g.tempoServicoPublicoCLT.periodoDesc.replace(/^\(|\)$/g, '')}):` : ':'}`,
      g.tempoServicoPublicoCLT
    ),
    // 5. Outras incorporações de Tempo de Serviço Público (Estatutário)
    formatItemRow(
      'Outras incorporações de Tempo de Serviço Público (Estatutário):',
      g.outrasIncorporacoesEstatutario
    ),
    // 6. Outras incorporações de Tempo de Serviço Público (CLT)
    formatItemRow(
      'Outras incorporações de Tempo de Serviço Público (CLT):',
      g.outrasIncorporacoesCLT
    ),
    // 7. Afastamentos sem vencimento
    formatItemRow(
      'Afastamentos sem vencimento:',
      g.afastamentosSemVencimento
    ),
    // 8. Penalidades Administrativas, suspensão e faltas
    formatItemRow(
      'Penalidades Administrativas, suspensão e faltas:',
      g.penalidadesAdministrativas
    ),
    // 9. Tempo Total de Serviço Público (Subtotal)
    formatItemRow(
      'Tempo Total de Serviço Público:',
      g.tempoTotalServicoPublico,
      false,
      true
    ),
    // 10. Tempo de Contribuição na iniciativa privada incorporado (INSS)
    formatItemRow(
      'Tempo de Contribuição na iniciativa privada incorporado (INSS)',
      g.tempoINSSPrivada,
      false,
      false,
      g.tempoINSSPrivada.periodoDesc
    ),
    // 11. Tempo Total de Serviço/Contribuição (Total Geral)
    formatItemRow(
      'Tempo Total de Serviço/Contribuição:',
      g.tempoTotalServicoContribuicao,
      true,
      false
    )
  ];

  // Colunas: [116, 17, 17, 17, 19] somam exatamente 186 mm
  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [
      [
        { content: 'Tempos de serviço/ contribuição:', styles: { halign: 'left' } },
        { content: 'ANOS', styles: { halign: 'center' } },
        { content: 'MESES', styles: { halign: 'center' } },
        { content: 'DIAS', styles: { halign: 'center' } },
        { content: 'EM DIAS', styles: { halign: 'right' } }
      ]
    ],
    body: gradeTableBody as any,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 1.45, bottom: 1.45, left: 2.2, right: 2.2 },
      textColor: COLOR_TEXT as any,
      lineColor: COLOR_BORDER as any,
      lineWidth: 0.15
    },
    headStyles: {
      fillColor: COLOR_PRIMARY as any,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.6,
      cellPadding: { top: 1.7, bottom: 1.7, left: 2.2, right: 2.2 }
    },
    columnStyles: {
      0: { cellWidth: 116 },
      1: { cellWidth: 17 },
      2: { cellWidth: 17 },
      3: { cellWidth: 17 },
      4: { cellWidth: 19 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 4.5;

  // BLOCO 3: TEMPOS DE EXERCÍCIO
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(COLOR_PRIMARY[0], COLOR_PRIMARY[1], COLOR_PRIMARY[2]);
  doc.text('3. TEMPOS DE EXERCÍCIO NO SERVIÇO PÚBLICO E CARGO EFETIVO', margin, currentY);
  currentY += 3.2;

  const te = data.temposExercicio;
  const temposExercicioBody = [
    [
      { content: `Tempo de serviço público ${te.servicoPublicoTotal.periodoDesc ? `(${te.servicoPublicoTotal.periodoDesc})` : ''}:` },
      { content: String(te.servicoPublicoTotal.anos), styles: { halign: 'center' } },
      { content: String(te.servicoPublicoTotal.meses), styles: { halign: 'center' } },
      { content: String(te.servicoPublicoTotal.dias), styles: { halign: 'center' } },
      { content: formatNumber(te.servicoPublicoTotal.totalDias), styles: { halign: 'right', fontStyle: 'bold', textColor: COLOR_PRIMARY as any } }
    ],
    [
      { content: `Tempo no cargo efetivo ${te.cargoEfetivoTotal.periodoDesc ? `(${te.cargoEfetivoTotal.periodoDesc})` : ''}:` },
      { content: String(te.cargoEfetivoTotal.anos), styles: { halign: 'center' } },
      { content: String(te.cargoEfetivoTotal.meses), styles: { halign: 'center' } },
      { content: String(te.cargoEfetivoTotal.dias), styles: { halign: 'center' } },
      { content: formatNumber(te.cargoEfetivoTotal.totalDias), styles: { halign: 'right', fontStyle: 'bold', textColor: COLOR_PRIMARY as any } }
    ]
  ];

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [
      [
        { content: 'Tempos de exercício', styles: { halign: 'left' } },
        { content: 'ANOS', styles: { halign: 'center' } },
        { content: 'MESES', styles: { halign: 'center' } },
        { content: 'DIAS', styles: { halign: 'center' } },
        { content: 'EM DIAS', styles: { halign: 'right' } }
      ]
    ],
    body: temposExercicioBody as any,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 1.45, bottom: 1.45, left: 2.2, right: 2.2 },
      textColor: COLOR_TEXT as any,
      lineColor: COLOR_BORDER as any,
      lineWidth: 0.15
    },
    headStyles: {
      fillColor: COLOR_PRIMARY as any,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.6,
      cellPadding: { top: 1.7, bottom: 1.7, left: 2.2, right: 2.2 }
    },
    columnStyles: {
      0: { cellWidth: 116 },
      1: { cellWidth: 17 },
      2: { cellWidth: 17 },
      3: { cellWidth: 17 },
      4: { cellWidth: 19 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 4.5;

  // BLOCO 4: OUTRAS INFORMAÇÕES E REGRAS TRANSITÓRIAS (LC 133/2021)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(COLOR_PRIMARY[0], COLOR_PRIMARY[1], COLOR_PRIMARY[2]);
  doc.text('4. INFORMAÇÕES PARA REGRAS TRANSITÓRIAS (LEI COMPLEMENTAR Nº 133/2021)', margin, currentY);
  currentY += 3.2;

  const rt = data.regrasTransitorias;
  const abonoDesc = rt.recebeAbono 
    ? `( X ) Sim   (   ) Não    |  Data de Início/Concessão: ${rt.dataAbono || 'Concedido'}`
    : `(   ) Sim   ( X ) Não`;

  const infoTransitoriasBody = [
    [
      { content: 'Outras Informações Funcionais', styles: { fontStyle: 'bold', fillColor: COLOR_HIGHLIGHT as any, textColor: COLOR_PRIMARY as any } },
      { content: 'Marco Temporal em 31/12/2021 (LC 133/2021)', styles: { fontStyle: 'bold', fillColor: COLOR_HIGHLIGHT as any, textColor: COLOR_PRIMARY as any } }
    ],
    [
      { content: `Adicional por Tempo de Serviço (ATS): ${rt.atsPercentual}%` },
      { content: `Idade em 31/12/2021: ${rt.idadeEm31Dez2021} anos` }
    ],
    [
      { content: `Recebe Abono de Permanência?\n${abonoDesc}` },
      { content: `Tempo de Serviço/Contribuição em 31/12/2021: ${rt.tempoEm31Dez2021Anos} anos (${formatNumber(data.marcos.diasAte31Dez2021)} dias)` }
    ]
  ];

  const colTransitoriaWidth = contentWidth / 2; // 93 mm
  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    body: infoTransitoriasBody as any,
    theme: 'grid',
    styles: {
      fontSize: 7.8,
      cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 },
      textColor: COLOR_TEXT as any,
      lineColor: COLOR_BORDER as any,
      lineWidth: 0.15
    },
    columnStyles: {
      0: { cellWidth: colTransitoriaWidth },
      1: { cellWidth: colTransitoriaWidth }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 7.0;

  // BLOCO 5: LAVRATURA E ASSINATURA
  if (currentY > pageHeight - 40) {
    doc.addPage();
    currentY = margin + 8;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
  doc.text(`${data.lavratura.cidade}, ${data.lavratura.data}`, margin, currentY);

  currentY += 16.0;

  // Campo de Assinatura Centralizado
  const signX = pageWidth / 2;
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.35);
  doc.line(signX - 48, currentY, signX + 48, currentY);
  currentY += 3.8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
  doc.text('Servidor(a) que lavrou a Certidão:', signX, currentY, { align: 'center' });
  currentY += 3.8;
  doc.setTextColor(COLOR_PRIMARY[0], COLOR_PRIMARY[1], COLOR_PRIMARY[2]);
  doc.setFontSize(8.8);
  doc.text(`${data.lavratura.servidorNome} - Matrícula ${data.lavratura.servidorMatricula}`, signX, currentY, { align: 'center' });
  currentY += 3.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
  doc.text(data.lavratura.setor, signX, currentY, { align: 'center' });
  currentY += 3.2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(COLOR_TEXT[0], COLOR_TEXT[1], COLOR_TEXT[2]);
  doc.text('Câmara Municipal de Curitiba', signX, currentY, { align: 'center' });

  // Linha divisória antes do rodapé
  doc.setDrawColor(215, 220, 228);
  doc.setLineWidth(0.25);
  doc.line(margin, pageHeight - 8.5, pageWidth - margin, pageHeight - 8.5);

  // Rodapé da página
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(90, 95, 105);
  const rodapeTexto = isSimulacao
    ? 'Câmara Municipal de Curitiba • DGEP • Minuta de Simulação gerada para simples conferência prévia e instrução de cenário (sem reserva de número oficial)'
    : 'Câmara Municipal de Curitiba • Diretoria de Gestão de Pessoas • Documento oficial emitido para instrução funcional e juntada em autos de aposentadoria';
  doc.text(rodapeTexto, margin, pageHeight - 5.0);
  doc.text('Página 1 de 1', pageWidth - margin, pageHeight - 5.0, { align: 'right' });

  const cleanNome = data.servidor.nome.replace(/\s+/g, '_');
  const filename = isSimulacao
    ? `Certidao_Simulacao_${cleanNome}.pdf`
    : `Certidao_Aposentadoria_${data.numeroCertidao.replace(/[^a-zA-Z0-9]/g, '-')}_${cleanNome}.pdf`;
  doc.save(filename);
}

/**
 * Gera o Dossiê Completo de Encaminhamento ao IPMC
 * Com Despacho Formal de Remessa, Termo de Juntada, Certidão e Quadro Sintético de Proventos
 */
export function gerarDossieEnvioIPMCPDF(data: CertidaoData): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2; // 186 mm

  // -------------------------------------------------------------
  // PÁGINA 1: DESPACHO DE ENCAMINHAMENTO E TERMO DE REMESSA AO IPMC
  // -------------------------------------------------------------
  let currentY = 10;

  // Cabeçalho Oficial CMC com Logomarca
  const logoW = 38;
  const logoH = logoW / CMC_LOGO_ASPECT_RATIO;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 47, 90);
  doc.setLineWidth(0.35);
  doc.roundedRect(margin, currentY, contentWidth, 20, 1.2, 1.2, 'S');

  doc.setFillColor(0, 47, 90);
  doc.rect(margin, currentY, contentWidth, 1.8, 'F');

  doc.addImage(CMC_LOGO_BASE64, 'PNG', margin + 3.2, currentY + 3.0, logoW, logoH);

  doc.setDrawColor(210, 215, 225);
  doc.setLineWidth(0.2);
  doc.line(margin + logoW + 5.5, currentY + 3.0, margin + logoW + 5.5, currentY + 18.5);

  const textX = margin + logoW + 9;
  doc.setFontSize(9.2);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 47, 90);
  doc.text('DIRETORIA DE GESTÃO DE PESSOAS — DGEP', textX, currentY + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(75, 80, 90);
  doc.text('Setor de Gestão de Processos e Benefícios Funcionais • Processo Eletrônico Previdenciário', textX, currentY + 14.5);

  currentY += 23.5;

  // Faixa de Protocolo e Processo
  doc.setFillColor(242, 246, 250);
  doc.setDrawColor(0, 75, 141);
  doc.setLineWidth(0.25);
  doc.rect(margin, currentY, contentWidth, 11, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.0);
  doc.setTextColor(0, 47, 90);
  doc.text('DESPACHO DE ENCAMINHAMENTO E REMESSA PREVIDENCIÁRIA', margin + 3.5, currentY + 4.8);

  doc.setFontSize(7.8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(50, 50, 50);
  doc.text(`PROCESSO SEI / ADMINISTRATIVO Nº: ${data.dadosIPMC?.numeroProcessoSEI || 'A vincular / Protocolo SEI'}`, margin + 3.5, currentY + 9.0);
  doc.text(`Data de Emissão: ${data.dataCertidao}`, pageWidth - margin - 3.5, currentY + 9.0, { align: 'right' });

  currentY += 15;

  // Destinatário
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(20, 20, 20);
  doc.text('AO:', margin, currentY);
  currentY += 3.8;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 47, 90);
  doc.text('INSTITUTO DE PREVIDÊNCIA DOS SERVIDORES DO MUNICÍPIO DE CURITIBA — IPMC', margin, currentY);
  currentY += 3.8;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text('Diretoria de Previdência / Gerência de Concessão de Benefícios e Aposentadorias', margin, currentY);
  doc.text('Município de Curitiba - PR', margin, currentY + 3.5);

  currentY += 9.5;

  // Assunto e Preamble
  doc.setFillColor(248, 249, 250);
  doc.rect(margin, currentY, contentWidth, 14, 'F');
  doc.setDrawColor(220, 225, 230);
  doc.rect(margin, currentY, contentWidth, 14, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(30, 30, 30);
  doc.text('ASSUNTO:', margin + 3, currentY + 4.8);
  doc.setFont('helvetica', 'normal');
  doc.text('Instrução e remessa de documentação funcional para fins de concessão de aposentadoria voluntária.', margin + 20, currentY + 4.8);

  doc.setFont('helvetica', 'bold');
  doc.text('INTERESSADO(A):', margin + 3, currentY + 10.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`${data.servidor.nome} (Matrícula ${data.servidor.matricula} - ${data.servidor.cargo})`, margin + 29, currentY + 10.5);

  currentY += 18.5;

  // Texto do Despacho Administrativo
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(20, 20, 20);

  const textoDespacho = [
    `1. Encaminham-se a esse Instituto de Previdência dos Servidores do Município de Curitiba (IPMC) os presentes autos eletrônicos devidamente instruídos com a Certidão de Tempo de Contribuição e Vínculos Funcionais nº ${data.numeroCertidao}, certidões de averbação e espelho de simulação de proventos referente ao(à) servidor(a) ${data.servidor.nome}, ocupante do cargo de ${data.servidor.cargo}, matrícula funcional nº ${data.servidor.matricula}.`,
    '',
    `2. Conforme apurado pelos registros funcionais desta Diretoria de Gestão de Pessoas (DGEP), o(a) servidor(a) conta com um Tempo Total de Contribuição apurado de ${data.gradeTempo.tempoTotalServicoContribuicao.anos} anos, ${data.gradeTempo.tempoTotalServicoContribuicao.meses} meses e ${data.gradeTempo.tempoTotalServicoContribuicao.dias} dias (${formatNumber(data.gradeTempo.tempoTotalServicoContribuicao.totalDias)} dias), tendo ingressado originariamente no serviço público em ${data.servidor.dataAdmissaoServicoPublico} e no regime estatutário desta Casa de Leis em ${data.servidor.dataAdmissaoEstatutario}.`,
    '',
    `3. Observa-se que em 31/12/2021 (marco temporal da Lei Complementar nº 133/2021), o(a) servidor(a) possuía ${data.regrasTransitorias.idadeEm31Dez2021} anos de idade e ${data.regrasTransitorias.tempoEm31Dez2021Anos} anos de tempo de contribuição, estando atualmente em gozo de Abono de Permanência ${data.regrasTransitorias.recebeAbono ? `desde ${data.regrasTransitorias.dataAbono}` : 'não concedido'}.`,
    '',
    `4. Pelo exposto, submetem-se os elementos para análise de elegibilidade, fixação do benefício nos termos da legislação municipal de regência (LC nº 133/2021 e regras constitucionais de transição aplicáveis) e demais providências para emissão do respectivo Decreto / Portaria de Concessão de Aposentadoria.`
  ];

  let yOffset = currentY;
  for (const line of textoDespacho) {
    if (line === '') {
      yOffset += 2;
    } else {
      const splitText = doc.splitTextToSize(line, contentWidth);
      doc.text(splitText, margin, yOffset);
      yOffset += splitText.length * 3.6;
    }
  }

  currentY = yOffset + 5.5;

  // Relação de Anexos
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(0, 47, 90);
  doc.text('RELAÇÃO DE DOCUMENTOS ACOSTADOS AOS AUTOS:', margin, currentY);
  currentY += 3.8;

  const anexos = [
    `[Anexo I] Certidão de Aposentadoria e Tempo de Contribuição nº ${data.numeroCertidao} (DGEP/CMC);`,
    `[Anexo II] Demonstrativo de Apuração de Média Salarial e Atualização de Contribuições Previdenciárias;`,
    `[Anexo III] Quadro Sintético de Estimativa de Proventos e Incorporações Proporcionais;`,
    `[Anexo IV] Cópia dos Atos de Averbação de Tempo de Contribuição (INSS e Órgãos Públicos) e registro no TCE-PR (${data.servidor.registroTribunalContas || 'conforme autos'}).`
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(40, 40, 40);
  anexos.forEach((anx) => {
    doc.text(anx, margin + 3.5, currentY);
    currentY += 3.8;
  });

  currentY += 10;

  // Assinatura do Despacho
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.0);
  doc.text(`${data.lavratura.cidade}, ${data.lavratura.data}`, margin, currentY);

  currentY += 12;
  const signX1 = pageWidth / 2;
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.3);
  doc.line(signX1 - 50, currentY, signX1 + 50, currentY);
  currentY += 3.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(20, 20, 20);
  doc.text(data.lavratura.servidorNome, signX1, currentY, { align: 'center' });
  currentY += 3.2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.text(`Matrícula ${data.lavratura.servidorMatricula} • ${data.lavratura.setor}`, signX1, currentY, { align: 'center' });
  currentY += 3.0;
  doc.text('Diretoria de Gestão de Pessoas — Câmara Municipal de Curitiba', signX1, currentY, { align: 'center' });

  // Rodapé página 1
  doc.setFontSize(6.2);
  doc.setTextColor(130, 130, 130);
  doc.text('Dossiê Previdenciário CMC / IPMC • Página 1 de 2 • Despacho de Remessa e Juntada', margin, pageHeight - 5.0);

  // -------------------------------------------------------------
  // PÁGINA 2: CERTIDÃO INTEGRAL DE TEMPO E ESPELHO PREVIDENCIÁRIO
  // -------------------------------------------------------------
  doc.addPage();
  currentY = 10;

  // Faixa Superior com Logomarca CMC
  const p2LogoW = 32;
  const p2LogoH = p2LogoW / CMC_LOGO_ASPECT_RATIO; // 12.44 mm

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 47, 90);
  doc.setLineWidth(0.35);
  doc.roundedRect(margin, currentY, contentWidth, 16.5, 1, 1, 'S');

  doc.setFillColor(0, 47, 90);
  doc.rect(margin, currentY, contentWidth, 1.5, 'F');

  doc.addImage(CMC_LOGO_BASE64, 'PNG', margin + 3, currentY + 2.2, p2LogoW, p2LogoH);

  doc.setDrawColor(210, 215, 225);
  doc.setLineWidth(0.2);
  doc.line(margin + p2LogoW + 5.5, currentY + 2.5, margin + p2LogoW + 5.5, currentY + 15.0);

  const p2TextX = margin + p2LogoW + 8.5;
  doc.setTextColor(0, 47, 90);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.0);
  doc.text('ESPELHO FUNCIONAL DA CERTIDÃO DE TEMPO DE CONTRIBUIÇÃO', p2TextX, currentY + 6.8);

  doc.setFontSize(7.2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(70, 70, 70);
  doc.text(`Anexo ao Processo IPMC • Certidão nº ${data.numeroCertidao} — Servidor: ${data.servidor.nome}`, p2TextX, currentY + 11.8);

  currentY += 19.5;

  // Resumo do Servidor em 1 tabela compacta
  const resumoServidor = [
    [
      { content: `Servidor: ${data.servidor.nome}`, styles: { fontStyle: 'bold' } },
      { content: `Matrícula: ${data.servidor.matricula}` },
      { content: `CPF: ${data.servidor.cpf}` },
      { content: `Data Nasc: ${data.servidor.dataNascimento} (${data.servidor.idadeHoje} anos)` }
    ],
    [
      { content: `Cargo: ${data.servidor.cargo} (Padrão ${data.servidor.padrao} / Ref. ${data.servidor.referencia})`, colSpan: 2 },
      { content: `Data de Admissão: ${data.servidor.dataAdmissaoServicoPublico}`, colSpan: 2 }
    ]
  ];

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    body: resumoServidor as any,
    theme: 'grid',
    styles: { fontSize: 7.8, cellPadding: 1.4, lineColor: [210, 215, 220], lineWidth: 0.15 },
    columnStyles: {
      0: { cellWidth: 46.5 },
      1: { cellWidth: 46.5 },
      2: { cellWidth: 46.5 },
      3: { cellWidth: 46.5 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 3.8;

  // Grade Compacta de Tempo
  const g = data.gradeTempo;
  const gradeCompacta = [
    [
      { content: `Tempo Estatutário CMC ${g.tempoEstatutarioCMC.periodoDesc ? `(${g.tempoEstatutarioCMC.periodoDesc.replace(/^\(|\)$/g, '')}):` : ':'}` },
      { content: String(g.tempoEstatutarioCMC.anos), styles: { halign: 'center' } },
      { content: String(g.tempoEstatutarioCMC.meses), styles: { halign: 'center' } },
      { content: String(g.tempoEstatutarioCMC.dias), styles: { halign: 'center' } },
      { content: formatNumber(g.tempoEstatutarioCMC.totalDias), styles: { halign: 'right', fontStyle: 'bold' } }
    ],
    [
      { content: 'Tempo Fícto (licenças-prêmio incorporadas – CMC):' },
      { content: String(g.tempoFictoLicencaPremio.anos), styles: { halign: 'center' } },
      { content: String(g.tempoFictoLicencaPremio.meses), styles: { halign: 'center' } },
      { content: String(g.tempoFictoLicencaPremio.dias), styles: { halign: 'center' } },
      { content: formatNumber(g.tempoFictoLicencaPremio.totalDias), styles: { halign: 'right', fontStyle: 'bold' } }
    ],
    [
      { content: 'Tempo de Serviço Público Municipal (Recibado) incorporado:' },
      { content: String(g.tempoServicoPublicoRecibado.anos), styles: { halign: 'center' } },
      { content: String(g.tempoServicoPublicoRecibado.meses), styles: { halign: 'center' } },
      { content: String(g.tempoServicoPublicoRecibado.dias), styles: { halign: 'center' } },
      { content: formatNumber(g.tempoServicoPublicoRecibado.totalDias), styles: { halign: 'right', fontStyle: 'bold' } }
    ],
    [
      { content: `Tempo de Serviço Público Municipal (CLT) incorporado ${g.tempoServicoPublicoCLT.periodoDesc ? `(${g.tempoServicoPublicoCLT.periodoDesc.replace(/^\(|\)$/g, '')}):` : ':'}` },
      { content: String(g.tempoServicoPublicoCLT.anos), styles: { halign: 'center' } },
      { content: String(g.tempoServicoPublicoCLT.meses), styles: { halign: 'center' } },
      { content: String(g.tempoServicoPublicoCLT.dias), styles: { halign: 'center' } },
      { content: formatNumber(g.tempoServicoPublicoCLT.totalDias), styles: { halign: 'right', fontStyle: 'bold' } }
    ],
    [
      { content: 'Outras incorporações de Tempo de Serviço Público (Estatutário):' },
      { content: String(g.outrasIncorporacoesEstatutario.anos), styles: { halign: 'center' } },
      { content: String(g.outrasIncorporacoesEstatutario.meses), styles: { halign: 'center' } },
      { content: String(g.outrasIncorporacoesEstatutario.dias), styles: { halign: 'center' } },
      { content: formatNumber(g.outrasIncorporacoesEstatutario.totalDias), styles: { halign: 'right', fontStyle: 'bold' } }
    ],
    [
      { content: 'Outras incorporações de Tempo de Serviço Público (CLT):' },
      { content: String(g.outrasIncorporacoesCLT.anos), styles: { halign: 'center' } },
      { content: String(g.outrasIncorporacoesCLT.meses), styles: { halign: 'center' } },
      { content: String(g.outrasIncorporacoesCLT.dias), styles: { halign: 'center' } },
      { content: formatNumber(g.outrasIncorporacoesCLT.totalDias), styles: { halign: 'right', fontStyle: 'bold' } }
    ],
    [
      { content: 'Afastamentos sem vencimento:' },
      { content: String(g.afastamentosSemVencimento.anos), styles: { halign: 'center' } },
      { content: String(g.afastamentosSemVencimento.meses), styles: { halign: 'center' } },
      { content: String(g.afastamentosSemVencimento.dias), styles: { halign: 'center' } },
      { content: formatNumber(g.afastamentosSemVencimento.totalDias), styles: { halign: 'right', fontStyle: 'bold' } }
    ],
    [
      { content: 'Penalidades Administrativas, suspensão e faltas:' },
      { content: String(g.penalidadesAdministrativas.anos), styles: { halign: 'center' } },
      { content: String(g.penalidadesAdministrativas.meses), styles: { halign: 'center' } },
      { content: String(g.penalidadesAdministrativas.dias), styles: { halign: 'center' } },
      { content: formatNumber(g.penalidadesAdministrativas.totalDias), styles: { halign: 'right', fontStyle: 'bold' } }
    ],
    [
      { content: 'Tempo Total de Serviço Público:', styles: { fontStyle: 'bold', fillColor: [240, 245, 252] } },
      { content: String(g.tempoTotalServicoPublico.anos), styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 245, 252] } },
      { content: String(g.tempoTotalServicoPublico.meses), styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 245, 252] } },
      { content: String(g.tempoTotalServicoPublico.dias), styles: { halign: 'center', fontStyle: 'bold', fillColor: [240, 245, 252] } },
      { content: formatNumber(g.tempoTotalServicoPublico.totalDias), styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 245, 252], textColor: [0, 75, 141] } }
    ],
    [
      { content: `Tempo de Contribuição na iniciativa privada incorporado (INSS) ${g.tempoINSSPrivada.periodoDesc ? `(${g.tempoINSSPrivada.periodoDesc})` : ''}` },
      { content: String(g.tempoINSSPrivada.anos), styles: { halign: 'center' } },
      { content: String(g.tempoINSSPrivada.meses), styles: { halign: 'center' } },
      { content: String(g.tempoINSSPrivada.dias), styles: { halign: 'center' } },
      { content: formatNumber(g.tempoINSSPrivada.totalDias), styles: { halign: 'right', fontStyle: 'bold' } }
    ],
    [
      { content: 'Tempo Total de Serviço/Contribuição:', styles: { fontStyle: 'bold', fillColor: [230, 240, 250] } },
      { content: String(g.tempoTotalServicoContribuicao.anos), styles: { halign: 'center', fontStyle: 'bold', fillColor: [230, 240, 250] } },
      { content: String(g.tempoTotalServicoContribuicao.meses), styles: { halign: 'center', fontStyle: 'bold', fillColor: [230, 240, 250] } },
      { content: String(g.tempoTotalServicoContribuicao.dias), styles: { halign: 'center', fontStyle: 'bold', fillColor: [230, 240, 250] } },
      { content: formatNumber(g.tempoTotalServicoContribuicao.totalDias), styles: { halign: 'right', fontStyle: 'bold', fillColor: [230, 240, 250], textColor: [0, 50, 110] } }
    ]
  ];

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [
      [
        { content: 'Discriminação do Tempo de Contribuição', styles: { halign: 'left' } },
        { content: 'ANOS', styles: { halign: 'center' } },
        { content: 'MESES', styles: { halign: 'center' } },
        { content: 'DIAS', styles: { halign: 'center' } },
        { content: 'TOTAL DIAS', styles: { halign: 'right' } }
      ]
    ],
    body: gradeCompacta as any,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.2, lineColor: [210, 215, 220], lineWidth: 0.15 },
    headStyles: { fillColor: [0, 47, 90], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.6 },
    columnStyles: {
      0: { cellWidth: 118 },
      1: { cellWidth: 16 },
      2: { cellWidth: 16 },
      3: { cellWidth: 16 },
      4: { cellWidth: 20 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 3.8;

  // QUADRO DE SÍNTESE DA SIMULAÇÃO PREVIDENCIÁRIA
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 47, 90);
  doc.text('SÍNTESE DA SIMULAÇÃO DE PROVENTOS E FUNDAMENTAÇÃO LEGAL', margin, currentY);
  currentY += 2.0;

  const dIPMC = data.dadosIPMC;
  const proventosEstimados = dIPMC?.valorProventosEstimados || 0;
  const valorATS = dIPMC?.valorATS || 0;
  const valorGE = dIPMC?.valorGratificacaoEspecial || 0;

  const quadroPrevidenciario = [
    [
      { content: 'Regra de Transição Aplicável / Sugerida:', styles: { fontStyle: 'bold', fillColor: [245, 247, 250] } },
      { content: dIPMC?.regraSugerida || 'Art. 3º da EC 47/2005 (Direito Adquirido / Transição com Paridade e Integralidade)', styles: { fontStyle: 'bold', textColor: [0, 75, 141] } }
    ],
    [
      { content: 'Critério de Proventos e Reajuste:', styles: { fontStyle: 'bold' } },
      { content: `${dIPMC?.tipoProventos || 'Integralidade e Paridade com a Carreira da CMC'}` }
    ],
    [
      { content: 'Adicional por Tempo de Serviço (ATS):', styles: { fontStyle: 'bold' } },
      { content: `${data.regrasTransitorias.atsPercentual}% ${valorATS > 0 ? `(R$ ${formatCurrency(valorATS)})` : ''}` }
    ],
    [
      { content: 'Gratificação Especial / Incorporação FGs:', styles: { fontStyle: 'bold' } },
      { content: valorGE > 0 ? `R$ ${formatCurrency(valorGE)} (incorporação proporcional apurada)` : 'Não apurada / sem incorporação' }
    ],
    [
      { content: 'Estimativa de Proventos Iniciais (Bruto):', styles: { fontStyle: 'bold', fillColor: [235, 245, 235] } },
      { content: proventosEstimados > 0 ? `R$ ${formatCurrency(proventosEstimados)}` : 'Conforme última remuneração do cargo efetivo', styles: { fontStyle: 'bold', fillColor: [235, 245, 235], textColor: [20, 100, 30] } }
    ],
    [
      { content: 'Situação de Abono de Permanência:', styles: { fontStyle: 'bold' } },
      { content: data.regrasTransitorias.recebeAbono ? `Servidor em gozo de Abono de Permanência desde ${data.regrasTransitorias.dataAbono || 'data do direito'}` : 'Não recebe / Não deferido' }
    ],
    [
      { content: 'Marco da Reforma da Previdência (LC 133/2021):', styles: { fontStyle: 'bold' } },
      { content: `Idade em 31/12/2021: ${data.regrasTransitorias.idadeEm31Dez2021} anos | Tempo: ${data.regrasTransitorias.tempoEm31Dez2021Anos} anos (${formatNumber(data.marcos.diasAte31Dez2021)} dias)` }
    ]
  ];

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    body: quadroPrevidenciario as any,
    theme: 'grid',
    styles: { fontSize: 7.6, cellPadding: 1.4, lineColor: [210, 215, 220], lineWidth: 0.15 },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 116 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 4.5;

  // Termo de Declaração Final
  doc.setFillColor(250, 252, 255);
  doc.rect(margin, currentY, contentWidth, 18, 'F');
  doc.setDrawColor(200, 215, 230);
  doc.rect(margin, currentY, contentWidth, 18, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.setTextColor(0, 47, 90);
  doc.text('TERMO DE CONFORMIDADE E VALIDAÇÃO PREVIDENCIÁRIA', margin + 3, currentY + 4.0);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.setTextColor(50, 50, 50);
  const textoTermo = 'Certifico que os tempos de serviço e contribuição, averbações de vínculos e dados remuneratórios constantes deste dossiê foram conferidos junto aos assentamentos funcionais arquivados na Diretoria de Gestão de Pessoas da Câmara Municipal de Curitiba, estando em consonância com a Lei Complementar Municipal nº 133/2021 e orientações normativas do IPMC.';
  const splitTermo = doc.splitTextToSize(textoTermo, contentWidth - 6);
  doc.text(splitTermo, margin + 3, currentY + 7.8);

  currentY += 23;

  // Assinatura final da folha 2
  const signX2 = pageWidth / 2;
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.35);
  doc.line(signX2 - 45, currentY, signX2 + 45, currentY);
  currentY += 3.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(20, 20, 20);
  doc.text(data.lavratura.servidorNome, signX2, currentY, { align: 'center' });
  currentY += 3.4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.text(`Matrícula ${data.lavratura.servidorMatricula} • ${data.lavratura.setor}`, signX2, currentY, { align: 'center' });

  // Rodapé página 2
  doc.setFontSize(6.2);
  doc.setTextColor(130, 130, 130);
  doc.text('Dossiê Previdenciário CMC / IPMC • Página 2 de 2 • Espelho Funcional e Síntese de Proventos', margin, pageHeight - 5.0);

  const cleanNome = data.servidor.nome.replace(/\s+/g, '_');
  const filename = `Dossie_Envio_IPMC_${data.numeroCertidao.replace(/[^a-zA-Z0-9]/g, '-')}_${cleanNome}.pdf`;
  doc.save(filename);
}
