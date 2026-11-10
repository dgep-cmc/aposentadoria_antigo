import { CertidaoData } from './exportCertidaoPDF';

export interface CertidaoEmitida {
  id: string;
  numeroCertidao: string; // Ex: "04/2026" ou "SIMULAÇÃO"
  tipo: 'oficial' | 'simulacao';
  dataCertidao: string; // "22/10/2026"
  dataEmissaoTimestamp: string; // ISO date
  servidorNome: string;
  matricula: string;
  cargo: string;
  tempoTotalDias: number;
  tempoFormatado: string; // Ex: "33 anos, 0 meses e 28 dias"
  emitidoPor?: string;
  snapshot: CertidaoData;
}

const STORAGE_KEY = 'dgep_certidoes_emitidas';
const SEQ_STORAGE_KEY_PREFIX = 'dgep_certidao_seq_';

/**
 * Retorna todas as certidões emitidas salvas
 */
export function getCertidoesEmitidas(): CertidaoEmitida[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list: CertidaoEmitida[] = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.error('Erro ao ler certidões emitidas:', e);
    return [];
  }
}

/**
 * Salva uma nova certidão emitida no histórico
 */
export function salvarCertidaoEmitida(item: CertidaoEmitida): void {
  try {
    const current = getCertidoesEmitidas();
    // Adiciona no início da lista
    const updated = [item, ...current.filter(c => c.id !== item.id)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Erro ao salvar certidão emitida:', e);
  }
}

/**
 * Remove uma certidão do histórico
 */
export function excluirCertidaoEmitida(id: string): void {
  try {
    const current = getCertidoesEmitidas();
    const updated = current.filter(c => c.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Erro ao excluir certidão emitida:', e);
  }
}

/**
 * Limpa todo o histórico de certidões emitidas
 */
export function limparHistoricoCertidoes(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {}
}

/**
 * Obtém o próximo número sequencial oficial da certidão sem incrementá-lo
 */
export function getProximoNumeroOficial(): string {
  const anoAtual = new Date().getFullYear();
  const storageKey = `${SEQ_STORAGE_KEY_PREFIX}${anoAtual}`;
  const savedSeq = localStorage.getItem(storageKey);
  let nextNum = savedSeq ? parseInt(savedSeq, 10) + 1 : 4; // Inicializa em 04/2026 pois o exemplo modelo oficial é 03/2026
  if (isNaN(nextNum) || nextNum < 1) nextNum = 1;
  return `${String(nextNum).padStart(2, '0')}/${anoAtual}`;
}

/**
 * Confirma e consome o próximo número sequencial oficial da certidão
 */
export function consumirProximoNumeroOficial(): string {
  const anoAtual = new Date().getFullYear();
  const storageKey = `${SEQ_STORAGE_KEY_PREFIX}${anoAtual}`;
  const savedSeq = localStorage.getItem(storageKey);
  let nextNum = savedSeq ? parseInt(savedSeq, 10) + 1 : 4;
  if (isNaN(nextNum) || nextNum < 1) nextNum = 1;
  localStorage.setItem(storageKey, String(nextNum));
  return `${String(nextNum).padStart(2, '0')}/${anoAtual}`;
}
