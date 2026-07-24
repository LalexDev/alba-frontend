import { Injectable } from '@angular/core';
import { defer, Observable } from 'rxjs';

import {
  Cliente,
  ClienteForm,
  RecetaExcelImport,
  RecetaForm,
  RecetaOptica,
  TipoDocumentoCliente
} from '../models/cliente.model';

import { SupabaseService } from './supabase.service';

interface ClienteDb {
  id_cliente: number;
  tipo_documento: TipoDocumentoCliente;
  numero_documento?: string | null;
  nombres: string;
  apellidos?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  fecha_nacimiento?: string | null;
  observaciones?: string | null;
  activo: boolean;
  creado_en?: string | null;
  actualizado_en?: string | null;
}

interface RecetaDb {
  id_receta: number;
  id_cliente: number;

  numero_orden: string;
  fecha_entrada: string;
  monto_cancelado?: number | string | null;
  monto_debe?: number | string | null;
  monto_total?: number | string | null;
  medida?: string | null;
  marca?: string | null;

  fecha_receta: string;
  profesional?: string | null;

  lejos_od_esfera?: number | string | null;
  lejos_od_cilindro?: number | string | null;
  lejos_od_eje?: number | string | null;
  lejos_oi_esfera?: number | string | null;
  lejos_oi_cilindro?: number | string | null;
  lejos_oi_eje?: number | string | null;
  lejos_dip?: number | string | null;

  cerca_od_esfera?: number | string | null;
  cerca_od_cilindro?: number | string | null;
  cerca_od_eje?: number | string | null;
  cerca_oi_esfera?: number | string | null;
  cerca_oi_cilindro?: number | string | null;
  cerca_oi_eje?: number | string | null;
  cerca_dip?: number | string | null;

  adicion_od?: number | string | null;
  adicion_oi?: number | string | null;
  agudeza_visual_od?: string | null;
  agudeza_visual_oi?: string | null;
  tipo_lente?: string | null;
  tipo_montura?: string | null;
  diagnostico?: string | null;
  observaciones?: string | null;
  proximo_control?: string | null;
  vigente: boolean;
  creado_en?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class ClienteService {

  private readonly columnasCliente = `
    id_cliente,
    tipo_documento,
    numero_documento,
    nombres,
    apellidos,
    telefono,
    email,
    direccion,
    fecha_nacimiento,
    observaciones,
    activo,
    creado_en,
    actualizado_en
  `;

  private readonly columnasReceta = `
    id_receta,
    id_cliente,
    numero_orden,
    fecha_entrada,
    monto_cancelado,
    monto_debe,
    monto_total,
    medida,
    marca,
    fecha_receta,
    profesional,
    lejos_od_esfera,
    lejos_od_cilindro,
    lejos_od_eje,
    lejos_oi_esfera,
    lejos_oi_cilindro,
    lejos_oi_eje,
    lejos_dip,
    cerca_od_esfera,
    cerca_od_cilindro,
    cerca_od_eje,
    cerca_oi_esfera,
    cerca_oi_cilindro,
    cerca_oi_eje,
    cerca_dip,
    adicion_od,
    adicion_oi,
    agudeza_visual_od,
    agudeza_visual_oi,
    tipo_lente,
    tipo_montura,
    diagnostico,
    observaciones,
    proximo_control,
    vigente,
    creado_en
  `;

  constructor(
    private supabaseService: SupabaseService
  ) {}

  listar(): Observable<Cliente[]> {
    return defer(async () => {
      const [clientesRespuesta, recetasRespuesta] =
        await Promise.all([
          this.supabaseService.client
            .from('clientes')
            .select(this.columnasCliente)
            .order('creado_en', {
              ascending: false
            }),

          this.supabaseService.client
            .from('recetas_opticas')
            .select(this.columnasReceta)
            .order('fecha_entrada', {
              ascending: false
            })
            .order('creado_en', {
              ascending: false
            })
        ]);

      if (clientesRespuesta.error) {
        throw new Error(
          clientesRespuesta.error.message
        );
      }

      if (recetasRespuesta.error) {
        throw new Error(
          recetasRespuesta.error.message
        );
      }

      const recetasPorCliente = new Map<
        number,
        RecetaOptica[]
      >();

      for (const fila of recetasRespuesta.data ?? []) {
        const receta = this.mapearReceta(
          fila as unknown as RecetaDb
        );

        const lista =
          recetasPorCliente.get(receta.clienteId) ?? [];

        lista.push(receta);
        recetasPorCliente.set(
          receta.clienteId,
          lista
        );
      }

      return (clientesRespuesta.data ?? []).map(
        (fila: unknown) => {
          const clienteDb =
            fila as unknown as ClienteDb;

          return this.mapearCliente(
            clienteDb,
            recetasPorCliente.get(
              Number(clienteDb.id_cliente)
            ) ?? []
          );
        }
      );
    });
  }

  registrarClienteConReceta(
    form: ClienteForm
  ): Observable<Cliente> {
    return defer(async () => {
      const nombres = form.nombres.trim();
      const apellidos = form.apellidos.trim();
      const numeroDocumento =
        form.numeroDocumento.trim();
      const receta = form.receta;
      const incluirReceta =
        form.incluirReceta &&
        this.tieneDatosReceta(receta);

      const montos =
        this.calcularMontosReceta(receta);

      if (!nombres) {
        throw new Error(
          'Los nombres del cliente son obligatorios.'
        );
      }

      const { data, error } =
        await this.supabaseService.client.rpc(
          'registrar_cliente_receta',
          {
            p_tipo_documento:
              numeroDocumento
                ? form.tipoDocumento
                : 'SIN_DOCUMENTO',
            p_numero_documento:
              numeroDocumento || null,
            p_nombres: nombres,
            p_apellidos:
              apellidos || null,
            p_telefono:
              form.telefono.trim() || null,
            p_email:
              form.correo.trim().toLowerCase() || null,
            p_direccion:
              form.direccion.trim() || null,
            p_fecha_nacimiento:
              form.fechaNacimiento || null,
            p_observaciones_cliente:
              form.observaciones.trim() || null,
            p_incluir_receta:
              incluirReceta,

            p_numero_orden:
              receta.numeroOrden.trim() || null,
            p_fecha_entrada:
              receta.fechaEntrada || receta.fechaReceta,
            p_monto_cancelado:
              montos.cancelado,
            p_monto_debe:
              montos.debe,
            p_monto_total:
              montos.total,
            p_medida:
              receta.medida.trim() || null,
            p_marca:
              receta.marca.trim() || null,
            p_fecha_receta:
              receta.fechaReceta,
            p_profesional:
              receta.profesional.trim() || null,

            p_lejos_od_esfera:
              this.numeroNullable(
                receta.lejosOdEsfera
              ),
            p_lejos_od_cilindro:
              this.numeroNullable(
                receta.lejosOdCilindro
              ),
            p_lejos_od_eje:
              this.numeroNullable(
                receta.lejosOdEje
              ),
            p_lejos_oi_esfera:
              this.numeroNullable(
                receta.lejosOiEsfera
              ),
            p_lejos_oi_cilindro:
              this.numeroNullable(
                receta.lejosOiCilindro
              ),
            p_lejos_oi_eje:
              this.numeroNullable(
                receta.lejosOiEje
              ),
            p_lejos_dip:
              this.numeroNullable(
                receta.lejosDip
              ),

            p_cerca_od_esfera:
              this.numeroNullable(
                receta.cercaOdEsfera
              ),
            p_cerca_od_cilindro:
              this.numeroNullable(
                receta.cercaOdCilindro
              ),
            p_cerca_od_eje:
              this.numeroNullable(
                receta.cercaOdEje
              ),
            p_cerca_oi_esfera:
              this.numeroNullable(
                receta.cercaOiEsfera
              ),
            p_cerca_oi_cilindro:
              this.numeroNullable(
                receta.cercaOiCilindro
              ),
            p_cerca_oi_eje:
              this.numeroNullable(
                receta.cercaOiEje
              ),
            p_cerca_dip:
              this.numeroNullable(
                receta.cercaDip
              ),

            p_adicion_od:
              this.numeroNullable(
                receta.adicionOd
              ),
            p_adicion_oi:
              this.numeroNullable(
                receta.adicionOi
              ),
            p_agudeza_visual_od:
              receta.agudezaVisualOd.trim() || null,
            p_agudeza_visual_oi:
              receta.agudezaVisualOi.trim() || null,
            p_tipo_lente:
              receta.tipoLente.trim() || null,
            p_tipo_montura:
              receta.tipoMontura.trim() || null,
            p_diagnostico:
              receta.diagnostico.trim() || null,
            p_observaciones_receta:
              receta.observaciones.trim() || null,
            p_proximo_control:
              receta.proximoControl || null,
            p_vigente:
              Boolean(receta.vigente)
          }
        );

      if (error) {
        throw new Error(
          this.traducirError(error.message)
        );
      }

      const respuesta = data as {
        id_cliente?: number;
      } | null;

      const idCliente = Number(
        respuesta?.id_cliente
      );

      if (!idCliente) {
        throw new Error(
          'No se obtuvo el identificador del cliente registrado.'
        );
      }

      return this.obtenerPorIdInterno(idCliente);
    });
  }

  crearReceta(
    idCliente: number,
    receta: RecetaForm
  ): Observable<RecetaOptica> {
    return defer(async () => {
      const payload =
        this.mapearRecetaParaInsertar(
          idCliente,
          receta
        );

      const { data, error } =
        await this.supabaseService.client
          .from('recetas_opticas')
          .insert(payload)
          .select(this.columnasReceta)
          .single();

      if (error) {
        throw new Error(
          this.traducirError(error.message)
        );
      }

      return this.mapearReceta(
        data as unknown as RecetaDb
      );
    });
  }

  importarRecetas(
    filas: RecetaExcelImport[]
  ): Observable<number> {
    return defer(async () => {
      let importadas = 0;

      for (const fila of filas) {
        const { error } =
          await this.supabaseService.client.rpc(
            'importar_receta_excel',
            {
              p_numero_orden:
                fila.numeroOrden || null,
              p_cliente:
                fila.cliente,
              p_documento:
                fila.documento || null,
              p_fecha_entrada:
                fila.fechaEntrada,
              p_monto_cancelado:
                this.normalizarMonto(
                  fila.montoCancelado
                ),
              p_monto_debe:
                Math.max(
                  this.normalizarMonto(
                    fila.montoTotal
                  ) -
                  this.normalizarMonto(
                    fila.montoCancelado
                  ),
                  0
                ),
              p_monto_total:
                this.normalizarMonto(
                  fila.montoTotal
                ),
              p_medida:
                fila.medida || null,
              p_montura:
                fila.montura || null,
              p_marca:
                fila.marca || null
            }
          );

        if (error) {
          throw new Error(
            `Orden ${fila.numeroOrden || '(automática)'}: ` +
            this.traducirError(error.message)
          );
        }

        importadas += 1;
      }

      return importadas;
    });
  }

  actualizarCliente(
    idCliente: number,
    form: ClienteForm
  ): Observable<Cliente> {
    return defer(async () => {
      const numeroDocumento =
        form.numeroDocumento.trim();

      const { error } =
        await this.supabaseService.client
          .from('clientes')
          .update({
            tipo_documento:
              numeroDocumento
                ? form.tipoDocumento
                : 'SIN_DOCUMENTO',
            numero_documento:
              numeroDocumento || null,
            nombres: form.nombres.trim(),
            apellidos: form.apellidos.trim(),
            telefono:
              form.telefono.trim() || null,
            email:
              form.correo.trim().toLowerCase() || null,
            direccion:
              form.direccion.trim() || null,
            fecha_nacimiento:
              form.fechaNacimiento || null,
            observaciones:
              form.observaciones.trim() || null
          })
          .eq('id_cliente', idCliente);

      if (error) {
        throw new Error(
          this.traducirError(error.message)
        );
      }

      return this.obtenerPorIdInterno(idCliente);
    });
  }

  cambiarEstado(
    idCliente: number,
    activo: boolean
  ): Observable<void> {
    return defer(async () => {
      const { error } =
        await this.supabaseService.client
          .from('clientes')
          .update({ activo })
          .eq('id_cliente', idCliente);

      if (error) {
        throw new Error(error.message);
      }
    });
  }

  obtenerPorId(
    idCliente: number
  ): Observable<Cliente> {
    return defer(
      async (): Promise<Cliente> => {
        if (
          !Number.isInteger(idCliente) ||
          idCliente <= 0
        ) {
          throw new Error(
            'El cliente seleccionado no es válido.'
          );
        }

        return this.obtenerPorIdInterno(
          idCliente
        );
      }
    );
  }

  historialRecetas(
    idCliente: number
  ): Observable<RecetaOptica[]> {
    return defer(async () => {
      const { data, error } =
        await this.supabaseService.client
          .from('recetas_opticas')
          .select(this.columnasReceta)
          .eq('id_cliente', idCliente)
          .order('fecha_entrada', {
            ascending: false
          })
          .order('creado_en', {
            ascending: false
          });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []).map((fila: unknown) =>
        this.mapearReceta(
          fila as unknown as RecetaDb
        )
      );
    });
  }

  private async obtenerPorIdInterno(
    idCliente: number
  ): Promise<Cliente> {
    const [clienteRespuesta, recetasRespuesta] =
      await Promise.all([
        this.supabaseService.client
          .from('clientes')
          .select(this.columnasCliente)
          .eq('id_cliente', idCliente)
          .single(),

        this.supabaseService.client
          .from('recetas_opticas')
          .select(this.columnasReceta)
          .eq('id_cliente', idCliente)
          .order('fecha_entrada', {
            ascending: false
          })
          .order('creado_en', {
            ascending: false
          })
      ]);

    if (clienteRespuesta.error) {
      throw new Error(
        clienteRespuesta.error.message
      );
    }

    if (recetasRespuesta.error) {
      throw new Error(
        recetasRespuesta.error.message
      );
    }

    const recetas = (recetasRespuesta.data ?? [])
      .map((fila: unknown) =>
        this.mapearReceta(
          fila as unknown as RecetaDb
        )
      );

    return this.mapearCliente(
      clienteRespuesta.data as unknown as ClienteDb,
      recetas
    );
  }

  private mapearRecetaParaInsertar(
    idCliente: number,
    receta: RecetaForm
  ): Record<string, unknown> {
    const montos =
      this.calcularMontosReceta(receta);

    const payload: Record<string, unknown> = {
      id_cliente: idCliente,
      fecha_entrada:
        receta.fechaEntrada || receta.fechaReceta,
      monto_cancelado:
        montos.cancelado,
      monto_debe:
        montos.debe,
      monto_total:
        montos.total,
      medida:
        receta.medida.trim() || null,
      marca:
        receta.marca.trim() || null,
      fecha_receta:
        receta.fechaReceta,
      profesional:
        receta.profesional.trim() || null,

      lejos_od_esfera:
        this.numeroNullable(receta.lejosOdEsfera),
      lejos_od_cilindro:
        this.numeroNullable(receta.lejosOdCilindro),
      lejos_od_eje:
        this.numeroNullable(receta.lejosOdEje),
      lejos_oi_esfera:
        this.numeroNullable(receta.lejosOiEsfera),
      lejos_oi_cilindro:
        this.numeroNullable(receta.lejosOiCilindro),
      lejos_oi_eje:
        this.numeroNullable(receta.lejosOiEje),
      lejos_dip:
        this.numeroNullable(receta.lejosDip),

      cerca_od_esfera:
        this.numeroNullable(receta.cercaOdEsfera),
      cerca_od_cilindro:
        this.numeroNullable(receta.cercaOdCilindro),
      cerca_od_eje:
        this.numeroNullable(receta.cercaOdEje),
      cerca_oi_esfera:
        this.numeroNullable(receta.cercaOiEsfera),
      cerca_oi_cilindro:
        this.numeroNullable(receta.cercaOiCilindro),
      cerca_oi_eje:
        this.numeroNullable(receta.cercaOiEje),
      cerca_dip:
        this.numeroNullable(receta.cercaDip),

      adicion_od:
        this.numeroNullable(receta.adicionOd),
      adicion_oi:
        this.numeroNullable(receta.adicionOi),
      agudeza_visual_od:
        receta.agudezaVisualOd.trim() || null,
      agudeza_visual_oi:
        receta.agudezaVisualOi.trim() || null,
      tipo_lente:
        receta.tipoLente.trim() || null,
      tipo_montura:
        receta.tipoMontura.trim() || null,
      diagnostico:
        receta.diagnostico.trim() || null,
      observaciones:
        receta.observaciones.trim() || null,
      proximo_control:
        receta.proximoControl || null,
      vigente:
        Boolean(receta.vigente)
    };

    if (receta.numeroOrden.trim()) {
      payload['numero_orden'] =
        receta.numeroOrden.trim();
    }

    return payload;
  }

  private mapearCliente(
    fila: ClienteDb,
    recetas: RecetaOptica[]
  ): Cliente {
    const nombres = fila.nombres ?? '';
    const apellidos = fila.apellidos ?? '';

    return {
      id: Number(fila.id_cliente),
      tipoDocumento:
        fila.tipo_documento ?? 'DNI',
      numeroDocumento:
        fila.numero_documento ?? '',
      nombres,
      apellidos,
      nombreCompleto: [nombres, apellidos]
        .filter(Boolean)
        .join(' ')
        .trim(),
      telefono:
        fila.telefono ?? '',
      correo:
        fila.email ?? '',
      direccion:
        fila.direccion ?? '',
      fechaNacimiento:
        fila.fecha_nacimiento ?? null,
      observaciones:
        fila.observaciones ?? '',
      activo:
        Boolean(fila.activo),
      creadoEn:
        fila.creado_en ?? undefined,
      actualizadoEn:
        fila.actualizado_en ?? undefined,
      recetas,
      ultimaReceta:
        recetas[0]
    };
  }

  private mapearReceta(
    fila: RecetaDb
  ): RecetaOptica {
    return {
      id: Number(fila.id_receta),
      clienteId:
        Number(fila.id_cliente),
      numeroOrden:
        fila.numero_orden,
      fechaEntrada:
        fila.fecha_entrada,
      montoCancelado:
        this.numeroDb(fila.monto_cancelado) ?? 0,
      montoDebe:
        this.numeroDb(fila.monto_debe) ?? 0,
      montoTotal:
        this.numeroDb(fila.monto_total) ?? 0,
      medida:
        fila.medida ?? '',
      marca:
        fila.marca ?? '',
      fechaReceta:
        fila.fecha_receta,
      profesional:
        fila.profesional ?? '',

      lejosOdEsfera:
        this.numeroDb(fila.lejos_od_esfera),
      lejosOdCilindro:
        this.numeroDb(fila.lejos_od_cilindro),
      lejosOdEje:
        this.numeroDb(fila.lejos_od_eje),
      lejosOiEsfera:
        this.numeroDb(fila.lejos_oi_esfera),
      lejosOiCilindro:
        this.numeroDb(fila.lejos_oi_cilindro),
      lejosOiEje:
        this.numeroDb(fila.lejos_oi_eje),
      lejosDip:
        this.numeroDb(fila.lejos_dip),

      cercaOdEsfera:
        this.numeroDb(fila.cerca_od_esfera),
      cercaOdCilindro:
        this.numeroDb(fila.cerca_od_cilindro),
      cercaOdEje:
        this.numeroDb(fila.cerca_od_eje),
      cercaOiEsfera:
        this.numeroDb(fila.cerca_oi_esfera),
      cercaOiCilindro:
        this.numeroDb(fila.cerca_oi_cilindro),
      cercaOiEje:
        this.numeroDb(fila.cerca_oi_eje),
      cercaDip:
        this.numeroDb(fila.cerca_dip),

      adicionOd:
        this.numeroDb(fila.adicion_od),
      adicionOi:
        this.numeroDb(fila.adicion_oi),
      agudezaVisualOd:
        fila.agudeza_visual_od ?? '',
      agudezaVisualOi:
        fila.agudeza_visual_oi ?? '',
      tipoLente:
        fila.tipo_lente ?? '',
      tipoMontura:
        fila.tipo_montura ?? '',
      diagnostico:
        fila.diagnostico ?? '',
      observaciones:
        fila.observaciones ?? '',
      proximoControl:
        fila.proximo_control ?? null,
      vigente:
        Boolean(fila.vigente),
      creadoEn:
        fila.creado_en ?? undefined
    };
  }

  private tieneDatosReceta(
    receta: RecetaForm
  ): boolean {
    const valores = [
      receta.numeroOrden,
      receta.montoCancelado,
      receta.montoDebe,
      receta.montoTotal,
      receta.medida,
      receta.marca,
      receta.lejosOdEsfera,
      receta.lejosOdCilindro,
      receta.lejosOdEje,
      receta.lejosOiEsfera,
      receta.lejosOiCilindro,
      receta.lejosOiEje,
      receta.lejosDip,
      receta.cercaOdEsfera,
      receta.cercaOdCilindro,
      receta.cercaOdEje,
      receta.cercaOiEsfera,
      receta.cercaOiCilindro,
      receta.cercaOiEje,
      receta.cercaDip,
      receta.adicionOd,
      receta.adicionOi,
      receta.agudezaVisualOd,
      receta.agudezaVisualOi,
      receta.tipoLente,
      receta.tipoMontura,
      receta.diagnostico,
      receta.observaciones,
      receta.proximoControl
    ];

    return valores.some(
      valor =>
        valor !== null &&
        valor !== undefined &&
        String(valor).trim() !== '' &&
        String(valor).trim() !== '0'
    );
  }

  private normalizarMonto(
    valor: string | number | null | undefined
  ): number {
    if (
      valor === null ||
      valor === undefined ||
      String(valor).trim() === ''
    ) {
      return 0;
    }

    const numero = Number(
      String(valor).replace(',', '.')
    );

    return Number.isFinite(numero)
      ? Number(numero.toFixed(2))
      : 0;
  }

  private calcularMontosReceta(
    receta: RecetaForm
  ): {
    total: number;
    cancelado: number;
    debe: number;
  } {
    const total = Math.max(
      this.normalizarMonto(
        receta.montoTotal
      ),
      0
    );

    const cancelado = Math.min(
      Math.max(
        this.normalizarMonto(
          receta.montoCancelado
        ),
        0
      ),
      total
    );

    const debe = Number(
      (total - cancelado).toFixed(2)
    );

    receta.montoTotal = total;
    receta.montoCancelado = cancelado;
    receta.montoDebe = debe;

    return {
      total,
      cancelado,
      debe
    };
  }

  private numeroNullable(
    valor: string | number | null
  ): number | null {
    if (
      valor === null ||
      valor === undefined ||
      String(valor).trim() === ''
    ) {
      return null;
    }

    const numero = Number(valor);

    return Number.isFinite(numero)
      ? numero
      : null;
  }

  private numeroDb(
    valor: number | string | null | undefined
  ): number | null {
    if (
      valor === null ||
      valor === undefined ||
      valor === ''
    ) {
      return null;
    }

    const numero = Number(valor);

    return Number.isFinite(numero)
      ? numero
      : null;
  }

  private traducirError(
    mensaje: string
  ): string {
    const texto =
      String(mensaje || '').toLowerCase();

    if (
      texto.includes('uq_clientes_documento') ||
      texto.includes('numero_documento') &&
      texto.includes('duplicate')
    ) {
      return 'Ya existe un cliente registrado con ese documento.';
    }

    if (
      texto.includes('uq_recetas_numero_orden') ||
      texto.includes('numero_orden') &&
      texto.includes('duplicate')
    ) {
      return 'Ya existe una receta con ese número de orden de trabajo.';
    }

    if (
      texto.includes('ck_recetas_total') ||
      texto.includes('cancelado + debe')
    ) {
      return 'No se pudo calcular el saldo de la receta.';
    }

    if (
      texto.includes('registrar_cliente_receta') ||
      texto.includes('could not find the function') ||
      texto.includes('schema cache')
    ) {
      return 'La función de clientes y recetas de Supabase está desactualizada. Ejecuta el archivo 12_corregir_guardado_recetas.sql.';
    }

    return mensaje;
  }
}
