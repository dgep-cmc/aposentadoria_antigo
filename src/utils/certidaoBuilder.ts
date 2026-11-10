import { UnifiedSimulation } from './simulationsStore';
import { CertidaoData, gerarCertidaoAposentadoriaPadraoPDF } from './exportCertidaoPDF';
import { 
  CertidaoEmitida, 
  salvarCertidaoEmitida, 
  consumirProximoNumeroOficial, 
  getProximoNumeroOficial 
} from './certidoesEmitidasStore';

const formatBR = (dateStr?: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
};

const parseDate = (dateStr?: string): Date | null => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Constrói o objeto completo de CertidaoData a partir de uma Simulação Unificada
 */
export function construirCertidaoAPartirDeSimulacao(
  sim: UnifiedSimulation, 
  options?: {
    tipo?: 'oficial' | 'simulacao';
    tipoCertidao?: 'aposentadoria' | 'abono_permanencia';
    numeroPersonalizado?: string;
    dataCertidaoPersonalizada?: string;
  }
): CertidaoData {
  const tipo = options?.tipo || 'simulacao';
  const tipoCertidao = options?.tipoCertidao || 'aposentadoria';
  const today = new Date();
  const emissaoStr = options?.dataCertidaoPersonalizada || 
    `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  const emissaoExtenso = `${today.getDate()} de ${today.toLocaleDateString('pt-BR', { month: 'long' })} de ${today.getFullYear()}`;

  // 1. Idade hoje e em 31/12/2021
  let idadeHoje = 60;
  let idade31Dez2021 = 55;
  if (sim.dataNascimento) {
    const bDate = parseDate(sim.dataNascimento);
    if (bDate) {
      idadeHoje = Math.floor((today.getTime() - bDate.getTime()) / (365.25 * 24 * 3600 * 1000));
      const date2021 = new Date(2021, 11, 31);
      idade31Dez2021 = Math.floor((date2021.getTime() - bDate.getTime()) / (365.25 * 24 * 3600 * 1000));
    }
  }

  // 2. Tempo Estatutário na CMC (de admissão estatutária até a data de emissão)
  const dataEstatutario = sim.ingressoCargoAtual || sim.ingressoCmc || '1993-10-02';
  const dateInicioEstatutario = parseDate(dataEstatutario) || new Date(1993, 9, 2);
  const diasCMC = Math.max(0, Math.floor((today.getTime() - dateInicioEstatutario.getTime()) / (24 * 3600 * 1000)));
  const anosCMC = Math.floor(diasCMC / 365);
  const remDiasCMC = diasCMC % 365;
  const mesesCMC = Math.floor(remDiasCMC / 30);
  const diasRestCMC = remDiasCMC % 30;
  const periodoCMC = `${formatBR(dataEstatutario)} a ${emissaoStr}`;

  // 3. Tempo Fícto (licenças-prêmio incorporadas – CMC)
  let diasFicto = 0;
  const fictas = (sim.incorporacoes || []).filter(inc => {
    const t = (inc.tipo || '').toLowerCase();
    const n = (inc.nome || '').toLowerCase();
    return t.includes('licenca') || t.includes('licença') || t.includes('premio') || t.includes('prêmio') || t.includes('ficto') || t.includes('fícto') || n.includes('licença') || n.includes('premio');
  });
  if (fictas.length > 0) {
    diasFicto = fictas.reduce((acc, inc) => acc + (inc.years * 365 + inc.months * 30 + inc.days), 0);
  }
  const anosFicto = Math.floor(diasFicto / 365);
  const mesesFicto = Math.floor((diasFicto % 365) / 30);
  const diasRestFicto = (diasFicto % 365) % 30;

  // 4. Tempo de Serviço Público Municipal (Recibado)
  let diasRecibado = 0;
  const recibados = (sim.incorporacoes || []).filter(inc => {
    const t = (inc.tipo || '').toLowerCase();
    const n = (inc.nome || '').toLowerCase();
    return t.includes('recibado') || n.includes('recibado');
  });
  if (recibados.length > 0) {
    diasRecibado = recibados.reduce((acc, inc) => acc + (inc.years * 365 + inc.months * 30 + inc.days), 0);
  }
  const anosRecibado = Math.floor(diasRecibado / 365);
  const mesesRecibado = Math.floor((diasRecibado % 365) / 30);
  const diasRestRecibado = (diasRecibado % 365) % 30;

  // 5. Tempo de Serviço Público Municipal (CLT) incorporado
  let diasCLT = sim.diasAverbadosSP || 0;
  let periodoCLT = '';
  if (sim.ingressoCmc && sim.ingressoCargoAtual && sim.ingressoCmc < sim.ingressoCargoAtual) {
    const dIngresso = parseDate(sim.ingressoCmc);
    const dCargo = parseDate(sim.ingressoCargoAtual);
    if (dIngresso && dCargo) {
      const dVespera = new Date(dCargo.getTime() - 24 * 3600 * 1000);
      const diasIntervalo = Math.floor((dCargo.getTime() - dIngresso.getTime()) / (24 * 3600 * 1000));
      diasCLT = Math.max(diasCLT, diasIntervalo);
      periodoCLT = `${formatBR(sim.ingressoCmc)} a ${formatBR(dVespera.toISOString().split('T')[0])}`;
    }
  } else if (diasCLT > 0) {
    periodoCLT = 'Tempo averbado de serviço público anterior';
  }
  const anosCLT = Math.floor(diasCLT / 365);
  const mesesCLT = Math.floor((diasCLT % 365) / 30);
  const diasRestCLT = (diasCLT % 365) % 30;

  // 6. Outras incorporações Estatutário
  let diasOutrasEst = 0;
  const outrasEst = (sim.incorporacoes || []).filter(inc => {
    const t = (inc.tipo || '').toLowerCase();
    const n = (inc.nome || '').toLowerCase();
    return (t.includes('estatut') || n.includes('estatut')) && !t.includes('cmc') && !n.includes('cmc');
  });
  if (outrasEst.length > 0) {
    diasOutrasEst = outrasEst.reduce((acc, inc) => acc + (inc.years * 365 + inc.months * 30 + inc.days), 0);
  }
  const anosOutrasEst = Math.floor(diasOutrasEst / 365);
  const mesesOutrasEst = Math.floor((diasOutrasEst % 365) / 30);
  const diasRestOutrasEst = (diasOutrasEst % 365) % 30;

  // 7. Outras incorporações CLT
  let diasOutrasCLT = 0;
  const outrasCLT = (sim.incorporacoes || []).filter(inc => {
    const t = (inc.tipo || '').toLowerCase();
    const n = (inc.nome || '').toLowerCase();
    return (t.includes('clt') || n.includes('clt')) && !t.includes('municipal') && !n.includes('municipal');
  });
  if (outrasCLT.length > 0) {
    diasOutrasCLT = outrasCLT.reduce((acc, inc) => acc + (inc.years * 365 + inc.months * 30 + inc.days), 0);
  }
  const anosOutrasCLT = Math.floor(diasOutrasCLT / 365);
  const mesesOutrasCLT = Math.floor((diasOutrasCLT % 365) / 30);
  const diasRestOutrasCLT = (diasOutrasCLT % 365) % 30;

  // 8. Afastamentos sem vencimento
  const diasAfastamento = sim.diasAfastamento || 0;
  const anosAfastamento = Math.floor(diasAfastamento / 365);
  const mesesAfastamento = Math.floor((diasAfastamento % 365) / 30);
  const diasRestAfastamento = (diasAfastamento % 365) % 30;

  // 9. Penalidades Administrativas
  let diasPenalidades = 0;
  const penalidades = (sim.incorporacoes || []).filter(inc => {
    const t = (inc.tipo || '').toLowerCase();
    const n = (inc.nome || '').toLowerCase();
    return t.includes('falta') || t.includes('suspens') || t.includes('penalidade') || n.includes('falta') || n.includes('suspens');
  });
  if (penalidades.length > 0) {
    diasPenalidades = penalidades.reduce((acc, inc) => acc + (inc.years * 365 + inc.months * 30 + inc.days), 0);
  }
  const anosPenalidades = Math.floor(diasPenalidades / 365);
  const mesesPenalidades = Math.floor((diasPenalidades % 365) / 30);
  const diasRestPenalidades = (diasPenalidades % 365) % 30;

  // 10. Subtotal: TEMPO TOTAL DE SERVIÇO PÚBLICO
  const totalPublicoDias = Math.max(0, diasCMC + diasFicto + diasRecibado + diasCLT + diasOutrasEst + diasOutrasCLT - diasAfastamento - diasPenalidades);
  const anosPublico = Math.floor(totalPublicoDias / 365);
  const remPublico = totalPublicoDias % 365;
  const mesesPublico = Math.floor(remPublico / 30);
  const diasRestPublico = remPublico % 30;

  // 11. INSS / Iniciativa Privada
  const diasINSS = sim.diasAverbadosINSS || 0;
  const anosINSS = Math.floor(diasINSS / 365);
  const mesesINSS = Math.floor((diasINSS % 365) / 30);
  const diasRestINSS = (diasINSS % 365) % 30;

  let inssDesc = '';
  const inssIncs = (sim.incorporacoes || []).filter(inc => {
    const t = (inc.tipo || '').toLowerCase();
    const n = (inc.nome || '').toLowerCase();
    return t.includes('inss') || t.includes('rgps') || n.includes('inss') || n.includes('rgps');
  });
  if (inssIncs.length > 0) {
    inssDesc = inssIncs.map(inc => inc.nome || (inc.dataInicio && inc.dataFim ? `${formatBR(inc.dataInicio)} a ${formatBR(inc.dataFim)}` : '')).filter(Boolean).join('; ');
  }
  if (!inssDesc && diasINSS > 0) {
    inssDesc = 'Certidão de Tempo de Contribuição CTC/INSS averbada';
  }

  // 12. Total Geral: TEMPO TOTAL DE SERVIÇO / CONTRIBUIÇÃO
  const totalGeralDias = totalPublicoDias + diasINSS;
  const anosGeral = Math.floor(totalGeralDias / 365);
  const remGeral = totalGeralDias % 365;
  const mesesGeral = Math.floor(remGeral / 30);
  const diasRestGeral = remGeral % 30;

  const dataAdmissaoSP = sim.ingressoCmc ? formatBR(sim.ingressoCmc) : formatBR(dataEstatutario);

  // Definição do Número
  let numero = options?.numeroPersonalizado;
  if (!numero) {
    if (tipo === 'simulacao') {
      numero = 'SIMULAÇÃO';
    } else {
      numero = getProximoNumeroOficial();
    }
  }

  return {
    numeroCertidao: numero,
    dataCertidao: emissaoStr,
    isSimulacao: tipo === 'simulacao',
    tipoCertidao: tipoCertidao,
    servidor: {
      nome: sim.nome || 'Servidor Municipal',
      rg: sim.rg || '',
      cpf: sim.cpf || '',
      sexo: sim.sexo === 'F' ? 'Feminino' : 'Masculino',
      matricula: sim.matricula || '',
      dataNascimento: formatBR(sim.dataNascimento) || '',
      idadeHoje,
      idadeEm31Dez2021: idade31Dez2021,
      orgao: 'Câmara Municipal de Curitiba',
      cargo: (sim.cargo || sim.selectedCareer || 'Servidor Público Municipal').replace(/_/g, ' '),
      padrao: sim.padrao || '306',
      referencia: sim.referencia || sim.selectedLevel || 'I',
      dataAdmissaoServicoPublico: dataAdmissaoSP,
      dataAdmissaoEstatutario: formatBR(dataEstatutario),
      dataRequerimento: emissaoStr,
      registroTribunalContas: sim.registroTribunalContas || ''
    },
    marcos: {
      diasAteEmissao: diasCMC,
      diasAte31Dez2021: Math.max(0, diasCMC - 1756),
      diferencaDias: 1756
    },
    gradeTempo: {
      tempoEstatutarioCMC: {
        anos: anosCMC,
        meses: mesesCMC,
        dias: diasRestCMC,
        totalDias: diasCMC,
        periodoDesc: periodoCMC
      },
      tempoFictoLicencaPremio: {
        anos: anosFicto,
        meses: mesesFicto,
        dias: diasRestFicto,
        totalDias: diasFicto,
        obs: 'Licenças-prêmio incorporadas – CMC'
      },
      tempoServicoPublicoRecibado: {
        anos: anosRecibado,
        meses: mesesRecibado,
        dias: diasRestRecibado,
        totalDias: diasRecibado
      },
      tempoServicoPublicoCLT: {
        anos: anosCLT,
        meses: mesesCLT,
        dias: diasRestCLT,
        totalDias: diasCLT,
        periodoDesc: periodoCLT
      },
      outrasIncorporacoesEstatutario: {
        anos: anosOutrasEst,
        meses: mesesOutrasEst,
        dias: diasRestOutrasEst,
        totalDias: diasOutrasEst
      },
      outrasIncorporacoesCLT: {
        anos: anosOutrasCLT,
        meses: mesesOutrasCLT,
        dias: diasRestOutrasCLT,
        totalDias: diasOutrasCLT
      },
      afastamentosSemVencimento: {
        anos: anosAfastamento,
        meses: mesesAfastamento,
        dias: diasRestAfastamento,
        totalDias: diasAfastamento
      },
      penalidadesAdministrativas: {
        anos: anosPenalidades,
        meses: mesesPenalidades,
        dias: diasRestPenalidades,
        totalDias: diasPenalidades
      },
      tempoTotalServicoPublico: {
        anos: anosPublico,
        meses: mesesPublico,
        dias: diasRestPublico,
        totalDias: totalPublicoDias
      },
      tempoINSSPrivada: {
        anos: anosINSS,
        meses: mesesINSS,
        dias: diasRestINSS,
        totalDias: diasINSS,
        periodoDesc: inssDesc
      },
      tempoTotalServicoContribuicao: {
        anos: anosGeral,
        meses: mesesGeral,
        dias: diasRestGeral,
        totalDias: totalGeralDias
      }
    },
    temposExercicio: {
      servicoPublicoTotal: {
        anos: anosPublico,
        meses: mesesPublico,
        dias: diasRestPublico,
        totalDias: totalPublicoDias,
        periodoDesc: `${dataAdmissaoSP} a ${emissaoStr}`
      },
      cargoEfetivoTotal: {
        anos: anosCMC,
        meses: mesesCMC,
        dias: diasRestCMC,
        totalDias: diasCMC,
        periodoDesc: periodoCMC
      }
    },
    regrasTransitorias: {
      atsPercentual: (sim.lastAtsNumber || 0) * 5 || Math.min(50, Math.floor(anosCMC / 5) * 5),
      recebeAbono: false,
      dataAbono: '',
      idadeEm31Dez2021: idade31Dez2021,
      tempoEm31Dez2021Anos: Math.max(0, anosGeral - 4)
    },
    lavratura: {
      cidade: 'Curitiba',
      data: emissaoExtenso,
      servidorNome: 'Setor de Gestão de Processos e Benefícios Funcionais',
      servidorMatricula: 'CMC/DGEP',
      setor: 'Diretoria de Gestão de Pessoas — DGEP'
    }
  };
}

/**
 * Emite uma Certidão de Simulação (sem consumir controle numérico) e registra no histórico
 */
export function emitirCertidaoSimulacao(sim: UnifiedSimulation, emitidoPor?: string): CertidaoData {
  const certidaoData = construirCertidaoAPartirDeSimulacao(sim, { tipo: 'simulacao', numeroPersonalizado: 'SIMULAÇÃO' });
  
  gerarCertidaoAposentadoriaPadraoPDF(certidaoData);

  const grade = certidaoData.gradeTempo.tempoTotalServicoContribuicao;
  const registro: CertidaoEmitida = {
    id: `sim_${Date.now()}`,
    numeroCertidao: 'SIMULAÇÃO',
    tipo: 'simulacao',
    dataCertidao: certidaoData.dataCertidao,
    dataEmissaoTimestamp: new Date().toISOString(),
    servidorNome: certidaoData.servidor.nome,
    matricula: certidaoData.servidor.matricula,
    cargo: certidaoData.servidor.cargo,
    tempoTotalDias: grade.totalDias,
    tempoFormatado: `${grade.anos} anos, ${grade.meses} meses e ${grade.dias} dias`,
    emitidoPor: emitidoPor || 'Sistema DGEP',
    snapshot: certidaoData
  };

  salvarCertidaoEmitida(registro);
  return certidaoData;
}

/**
 * Emite uma Certidão Oficial com controle numérico sequencial e registra no histórico
 */
export function emitirCertidaoOficial(sim: UnifiedSimulation, emitidoPor?: string, numeroDefinido?: string): CertidaoData {
  const numero = numeroDefinido || consumirProximoNumeroOficial();
  const certidaoData = construirCertidaoAPartirDeSimulacao(sim, { tipo: 'oficial', numeroPersonalizado: numero });

  gerarCertidaoAposentadoriaPadraoPDF(certidaoData);

  const grade = certidaoData.gradeTempo.tempoTotalServicoContribuicao;
  const registro: CertidaoEmitida = {
    id: `oficial_${Date.now()}`,
    numeroCertidao: numero,
    tipo: 'oficial',
    dataCertidao: certidaoData.dataCertidao,
    dataEmissaoTimestamp: new Date().toISOString(),
    servidorNome: certidaoData.servidor.nome,
    matricula: certidaoData.servidor.matricula,
    cargo: certidaoData.servidor.cargo,
    tempoTotalDias: grade.totalDias,
    tempoFormatado: `${grade.anos} anos, ${grade.meses} meses e ${grade.dias} dias`,
    emitidoPor: emitidoPor || 'Sistema DGEP',
    snapshot: certidaoData
  };

  salvarCertidaoEmitida(registro);
  return certidaoData;
}

/**
 * Emite uma Certidão de Abono de Permanência (Simulação)
 */
export function emitirCertidaoAbonoSimulacao(sim: UnifiedSimulation, emitidoPor?: string): CertidaoData {
  const certidaoData = construirCertidaoAPartirDeSimulacao(sim, { tipo: 'simulacao', tipoCertidao: 'abono_permanencia', numeroPersonalizado: 'SIMULAÇÃO' });
  gerarCertidaoAposentadoriaPadraoPDF(certidaoData);

  const grade = certidaoData.gradeTempo.tempoTotalServicoContribuicao;
  const registro: CertidaoEmitida = {
    id: `sim_abono_${Date.now()}`,
    numeroCertidao: 'SIMULAÇÃO (ABONO)',
    tipo: 'simulacao',
    dataCertidao: certidaoData.dataCertidao,
    dataEmissaoTimestamp: new Date().toISOString(),
    servidorNome: certidaoData.servidor.nome,
    matricula: certidaoData.servidor.matricula,
    cargo: certidaoData.servidor.cargo,
    tempoTotalDias: grade.totalDias,
    tempoFormatado: `${grade.anos} anos, ${grade.meses} meses e ${grade.dias} dias`,
    emitidoPor: emitidoPor || 'Sistema DGEP',
    snapshot: certidaoData
  };

  salvarCertidaoEmitida(registro);
  return certidaoData;
}

/**
 * Emite uma Certidão Oficial de Abono de Permanência com controle numérico sequencial
 */
export function emitirCertidaoAbonoOficial(sim: UnifiedSimulation, emitidoPor?: string, numeroDefinido?: string): CertidaoData {
  const numero = numeroDefinido || consumirProximoNumeroOficial();
  const certidaoData = construirCertidaoAPartirDeSimulacao(sim, { tipo: 'oficial', tipoCertidao: 'abono_permanencia', numeroPersonalizado: numero });
  gerarCertidaoAposentadoriaPadraoPDF(certidaoData);

  const grade = certidaoData.gradeTempo.tempoTotalServicoContribuicao;
  const registro: CertidaoEmitida = {
    id: `oficial_abono_${Date.now()}`,
    numeroCertidao: numero,
    tipo: 'oficial',
    dataCertidao: certidaoData.dataCertidao,
    dataEmissaoTimestamp: new Date().toISOString(),
    servidorNome: certidaoData.servidor.nome,
    matricula: certidaoData.servidor.matricula,
    cargo: certidaoData.servidor.cargo,
    tempoTotalDias: grade.totalDias,
    tempoFormatado: `${grade.anos} anos, ${grade.meses} meses e ${grade.dias} dias`,
    emitidoPor: emitidoPor || 'Sistema DGEP',
    snapshot: certidaoData
  };

  salvarCertidaoEmitida(registro);
  return certidaoData;
}
