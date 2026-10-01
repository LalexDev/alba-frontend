/** Vacío es ausencia; una medida mal escrita nunca se convierte a null. */
export function convertirMedida(valor: string | number | null | undefined): number | null {
  if (valor == null || String(valor).trim() === '') return null;
  const texto = String(valor).trim()
    .replace(/[−–﹣－]/g, '-')
    .replace(/＋/g, '+')
    .replace(/^([+-])\s+/, '$1')
    .replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(texto)) {
    throw new Error('Medida inválida. Usa +1.25, -1.25 o 1.25.');
  }
  const numero = Number(texto);
  if (!Number.isFinite(numero)) throw new Error('La medida debe ser un número finito.');
  return numero;
}
