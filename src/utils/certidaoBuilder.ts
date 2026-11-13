import { UnifiedSimulation } from './simulationsStore';
import { CertidaoData, gerarCertidaoAposentadoriaPadraoPDF } from './exportCertidaoPDF';
import { getPatternForCareer } from './settingsStore';
import { 
  CertidaoEmitida, 
  salvarCertidaoEmitida, 
  consumirProximoNumeroOficial, 
  getProximoNumeroOficial 
} from './certidoesEmitidasStore';

const formatBR = (dateStr?: string) => {
  if (!dateStr) return '';
  const clean = dateStr.split('T')[0].trim();
  const parts = clean.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return clean;
};

const parseDate = (dateStr?: string): Date | null => {
  if (!dateStr) return null;
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const y = parseInt(parts[2], 10);
      if (!isNaN(d) && !isNaN(m) && !isNaN(y)) {
        return new Date(y, m, d);
      }
    }
  }
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
};

function calcularTempoRPPSCertidao(d1: Date, d2: Date) {
  const d2_exclusive = new Date(d2.getTime());
  d2_exclusive.setDate(d2_exclusive.getDate() + 1);

  let years = 0;
  let months = 0;
  let current = new Date(d1.getTime());

  while (true) {
    const nextYear = new Date(current.getTime());
    nextYear.setFullYear(current.getFullYear() + 1);
    if (nextYear.getTime() <= d2_exclusive.getTime()) {
      current = nextYear;
      years++;
    } else {
      break;
    }
  }

  while (true) {
    const nextMonth = new Date(current.getTime());
    const currentDay = current.getDate();
    nextMonth.setMonth(current.getMonth() + 1);
    if (nextMonth.getDate() < currentDay) {
      nextMonth.setDate(0);
    }
    if (nextMonth.getTime() <= d2_exclusive.getTime()) {
      current = nextMonth;
      months++;
    } else {
      break;
    }
  }

  const diffMs = d2_exclusive.getTime() - current.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return { years, months, days };
}

export function calcularDiasIncorporacao(inc: UnifiedSimulation['incorporacoes'][number]): number {
  if (inc.useDates && inc.dataInicio && inc.dataFim) {
    const d1 = new Date(inc.dataInicio.includes('T') ? inc.dataInicio : `${inc.dataInicio}T12:00:00`);
    const d2 = new Date(inc.dataFim.includes('T') ? inc.dataFim : `${inc.dataFim}T12:00:00`);
    if (!isNaN(d1.getTime()) && !isNaN(d2.getTime()) && d2 >= d1) {
      const rpps = calcularTempoRPPSCertidao(d1, d2);
      return (rpps.years * 365) + (rpps.months * 30) + rpps.days;
    }
  }
  return ((inc.years || 0) * 365) + ((inc.months || 0) * 30) + (inc.days || 0);
}

const formatarYMD = (totalDias: number) => {
  const anos = Math.floor(totalDias / 365);
  const meses = Math.floor((totalDias % 365) / 30);
  const dias = (totalDias % 365) % 30;
  return `${anos}a ${meses}m ${dias}d`;
};

export function extrairTemposIncorporacoes(
  incorporacoes: UnifiedSimulation['incorporacoes'] | undefined,
  includeSimulated = true
) {
  let diasFicto = 0;
  let diasRecibado = 0;
  let diasOutrasEst = 0;
  let diasOutrasCLT = 0;
  let diasPenalidades = 0;
  let diasINSSIncs = 0;
  const inssDescs: string[] = [];

  const activeIncs = (incorporacoes || []).filter(inc =>
    includeSimulated ? true : inc.status !== 'simular'
  );

  for (const inc of activeIncs) {
    const t = (inc.tipo || '').toLowerCase();
    const n = (inc.nome || '').toLowerCase();
    const dias = calcularDiasIncorporacao(inc);

    const isPenalidade =
      t.includes('falta') || t.includes('suspens') || t.includes('penalidade') ||
      n.includes('falta') || n.includes('suspens');
    if (isPenalidade) {
      diasPenalidades += dias;
      continue;
    }

    const isFicta =
      t.includes('licenca') || t.includes('licença') || t.includes('premio') ||
      t.includes('prêmio') || t.includes('ficto') || t.includes('fícto') ||
      n.includes('licença') || n.includes('licenca') || n.includes('premio') || n.includes('prêmio');
    if (isFicta) {
      diasFicto += dias;
      continue;
    }

    const isRecibado = t.includes('recibado') || n.includes('recibado');
    if (isRecibado) {
      diasRecibado += dias;
      continue;
    }

    const isINSS =
      t === 'contribution-only' ||
      t === 'pre-1994' ||
      t.includes('inss') ||
      t.includes('rgps') ||
      (t !== 'all-effects' && (n.includes('inss') || n.includes('rgps')));
    if (isINSS) {
      diasINSSIncs += dias;
      if (dias > 0) {
        const nomeLimpo = (inc.nome || '').trim();
        if (nomeLimpo) {
          if (inc.useDates && inc.dataInicio && inc.dataFim) {
            inssDescs.push(`${nomeLimpo} (${formatBR(inc.dataInicio)} a ${formatBR(inc.dataFim)})`);
          } else {
            inssDescs.push(nomeLimpo);
          }
        } else if (inc.dataInicio && inc.dataFim) {
          inssDescs.push(`${formatBR(inc.dataInicio)} a ${formatBR(inc.dataFim)}`);
        } else if (t === 'contribution-only') {
          inssDescs.push(`Tempo e contribuição pós-07/1994 (${formatarYMD(dias)})`);
        } else if (t === 'pre-1994') {
          inssDescs.push(`Apenas tempo pré-07/1994 (${formatarYMD(dias)})`);
        } else {
          inssDescs.push(`CTC/INSS averbada (${formatarYMD(dias)})`);
        }
      }
      continue;
    }

    const isCLT =
      (t.includes('clt') || n.includes('clt')) &&
      !t.includes('municipal') &&
      !n.includes('municipal');
    if (isCLT) {
      diasOutrasCLT += dias;
      continue;
    }

    const isEstatutario =
      t === 'all-effects' ||
      ((t.includes('estatut') || n.includes('estatut')) && !t.includes('cmc') && !n.includes('cmc'));
    if (isEstatutario) {
      diasOutrasEst += dias;
    }
  }

  return {
    diasFicto,
    diasRecibado,
    diasOutrasEst,
    diasOutrasCLT,
    diasPenalidades,
    diasINSSIncs,
    inssDesc: inssDescs.join('; ')
  };
}

/**
 * Constrói o objeto completo de CertidaoData a partir de uma Simulação Unificada
 * IMPORTANTE: Para certidões, o tempo computado é SEMPRE o tempo decorrido ATUAL 
 * até a data de emissão do documento, e NÃO a data de projeção de aposentadoria futura.
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
  
  // Data de referência de corte da certidão: a data de emissão do documento (hoje ou personalizada)
  const dataReferenciaEmissao = parseDate(options?.dataCertidaoPersonalizada) || new Date();
  const emissaoStr = options?.dataCertidaoPersonalizada || 
    `${String(dataReferenciaEmissao.getDate()).padStart(2, '0')}/${String(dataReferenciaEmissao.getMonth() + 1).padStart(2, '0')}/${dataReferenciaEmissao.getFullYear()}`;
  const emissaoExtenso = `${dataReferenciaEmissao.getDate()} de ${dataReferenciaEmissao.toLocaleDateString('pt-BR', { month: 'long' })} de ${dataReferenciaEmissao.getFullYear()}`;

  // 1. Idade na data de emissão e em 31/12/2021
  let idadeHoje = 60;
  let idade31Dez2021 = 55;
  if (sim.dataNascimento) {
    const bDate = parseDate(sim.dataNascimento);
    if (bDate) {
      idadeHoje = Math.floor((dataReferenciaEmissao.getTime() - bDate.getTime()) / (365.25 * 24 * 3600 * 1000));
      const date2021 = new Date(2021, 11, 31);
      idade31Dez2021 = Math.floor((date2021.getTime() - bDate.getTime()) / (365.25 * 24 * 3600 * 1000));
    }
  }

  // 2. Tempo Estatutário na CMC (de admissão na CMC / cargo até a data de emissão da certidão)
  const dataEstatutario = sim.ingressoCargoAtual || sim.ingressoCmc || '1993-10-02';
  const dateInicioEstatutario = parseDate(dataEstatutario) || new Date(1993, 9, 2);
  const diasCMC = Math.max(0, Math.floor((dataReferenciaEmissao.getTime() - dateInicioEstatutario.getTime()) / (24 * 3600 * 1000)));
  const anosCMC = Math.floor(diasCMC / 365);
  const remDiasCMC = diasCMC % 365;
  const mesesCMC = Math.floor(remDiasCMC / 30);
  const diasRestCMC = remDiasCMC % 30;
  const periodoCMC = `${formatBR(dataEstatutario)} a ${emissaoStr}`;

  // Marcos temporais dinâmicos (data de emissão vs 31/12/2021)
  const date31Dez2021 = new Date(2021, 11, 31);
  const diasAte31Dez2021 = (dateInicioEstatutario && dateInicioEstatutario <= date31Dez2021)
    ? Math.max(0, Math.floor((date31Dez2021.getTime() - dateInicioEstatutario.getTime()) / (24 * 3600 * 1000)))
    : 0;
  const diferencaDias = Math.max(0, diasCMC - diasAte31Dez2021);

  const incs = extrairTemposIncorporacoes(sim.incorporacoes, tipo !== 'oficial');

  // 3. Tempo Fícto (licenças-prêmio incorporadas – CMC)
  const diasFicto = incs.diasFicto;
  const anosFicto = Math.floor(diasFicto / 365);
  const mesesFicto = Math.floor((diasFicto % 365) / 30);
  const diasRestFicto = (diasFicto % 365) % 30;

  // 4. Tempo de Serviço Público Municipal (Recibado)
  const diasRecibado = incs.diasRecibado;
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
  const diasOutrasEst = incs.diasOutrasEst;
  const anosOutrasEst = Math.floor(diasOutrasEst / 365);
  const mesesOutrasEst = Math.floor((diasOutrasEst % 365) / 30);
  const diasRestOutrasEst = (diasOutrasEst % 365) % 30;

  // 7. Outras incorporações CLT
  const diasOutrasCLT = incs.diasOutrasCLT;
  const anosOutrasCLT = Math.floor(diasOutrasCLT / 365);
  const mesesOutrasCLT = Math.floor((diasOutrasCLT % 365) / 30);
  const diasRestOutrasCLT = (diasOutrasCLT % 365) % 30;

  // 8. Afastamentos sem vencimento
  const diasAfastamento = sim.diasAfastamento || 0;
  const anosAfastamento = Math.floor(diasAfastamento / 365);
  const mesesAfastamento = Math.floor((diasAfastamento % 365) / 30);
  const diasRestAfastamento = (diasAfastamento % 365) % 30;

  // 9. Penalidades Administrativas
  const diasPenalidades = incs.diasPenalidades;
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
  const diasINSS = (sim.diasAverbadosINSS || 0) + incs.diasINSSIncs;
  const anosINSS = Math.floor(diasINSS / 365);
  const mesesINSS = Math.floor((diasINSS % 365) / 30);
  const diasRestINSS = (diasINSS % 365) % 30;

  let inssDesc = incs.inssDesc;
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
      padrao: sim.padrao || getPatternForCareer(sim.selectedCareer || sim.cargo) || '',
      referencia: sim.referencia || sim.selectedLevel || 'I',
      dataAdmissaoServicoPublico: dataAdmissaoSP,
      dataAdmissaoEstatutario: formatBR(dataEstatutario),
      dataRequerimento: emissaoStr,
      registroTribunalContas: sim.registroTribunalContas || ''
    },
    marcos: {
      diasAteEmissao: diasCMC,
      diasAte31Dez2021: diasAte31Dez2021,
      diferencaDias: diferencaDias
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
      tempoEm31Dez2021Anos: Math.max(0, Math.floor(diasAte31Dez2021 / 365))
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
  const proximoSugerido = getProximoNumeroOficial();
  const numeroLimpo = (numeroDefinido || '').trim();
  const numero =
    !numeroLimpo || numeroLimpo === 'SIMULAÇÃO' || numeroLimpo === proximoSugerido
      ? consumirProximoNumeroOficial()
      : numeroLimpo;
  const certidaoData = construirCertidaoAPartirDeSimulacao(sim, { tipo: 'oficial', tipoCertidao: 'aposentadoria', numeroPersonalizado: numero });

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
  const proximoSugerido = getProximoNumeroOficial();
  const numeroLimpo = (numeroDefinido || '').trim();
  const numero =
    !numeroLimpo || numeroLimpo === 'SIMULAÇÃO' || numeroLimpo === proximoSugerido
      ? consumirProximoNumeroOficial()
      : numeroLimpo;
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
