import {
  Injectable
} from '@angular/core';
import {
  defer,
  Observable
} from 'rxjs';

import {
  MovimientoInventario,
  MovimientoInventarioDb,
  MovimientoProductoDb,
  MovimientoUsuarioDb,
  RegistrarMovimientoDb,
  RegistrarMovimientoRequest,
  RegistrarMovimientoRespuesta,
  UsuarioResponsableMovimiento
} from '../models/movimiento-inventario.model';

import {
  SupabaseService
} from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class MovimientoInventarioService {

  constructor(
    private supabaseService:
      SupabaseService
  ) {}

  listar(
    limite: number = 2000
  ): Observable<MovimientoInventario[]> {
    return defer(
      () =>
        this.listarInterno(
          limite
        )
    );
  }

  registrar(
    request:
      RegistrarMovimientoRequest
  ): Observable<RegistrarMovimientoRespuesta> {
    return defer(
      () =>
        this.registrarInterno(
          request
        )
    );
  }

  obtenerUsuarioResponsable():
    Observable<UsuarioResponsableMovimiento> {
    return defer(
      () =>
        this.obtenerUsuarioResponsableInterno()
    );
  }

  private async listarInterno(
    limite: number
  ): Promise<MovimientoInventario[]> {
    const cantidadLimite =
      Number.isInteger(limite) &&
      limite > 0
        ? Math.min(
            limite,
            5000
          )
        : 2000;

    const {
      data,
      error
    } =
      await this.supabaseService.client
        .from(
          'movimientos_inventario'
        )
        .select(`
          id_movimiento,
          id_producto,
          tipo_movimiento,
          cantidad,
          stock_anterior,
          stock_nuevo,
          referencia_tipo,
          referencia_id,
          motivo,
          fecha_movimiento,

          producto:productos (
            id_producto,
            codigo_interno,
            codigo_barras,
            nombre,
            stock_actual,
            stock_minimo
          ),

          usuario:usuarios (
            id_usuario,
            nombres,
            apellidos,
            email
          )
        `)
        .order(
          'fecha_movimiento',
          {
            ascending: false
          }
        )
        .limit(
          cantidadLimite
        );

    if (error) {
      console.error(
        'Error al listar movimientos:',
        error
      );

      throw new Error(
        this.traducirError(
          error.message
        )
      );
    }

    return (
      data ?? []
    ).map(
      fila =>
        this.mapearMovimiento(
          fila as unknown as
            MovimientoInventarioDb
        )
    );
  }

  private async registrarInterno(
    request:
      RegistrarMovimientoRequest
  ): Promise<RegistrarMovimientoRespuesta> {
    const productoId =
      Number(
        request.productoId
      );

    const cantidad =
      Number(
        request.cantidad
      );

    if (
      !Number.isInteger(productoId) ||
      productoId <= 0
    ) {
      throw new Error(
        'El producto seleccionado no es válido.'
      );
    }

    const minimo =
      request.tipo ===
        'AJUSTE'
        ? 0
        : 1;

    if (
      !Number.isInteger(cantidad) ||
      cantidad < minimo
    ) {
      throw new Error(
        request.tipo ===
          'AJUSTE'
          ? 'El nuevo stock debe ser un número entero igual o mayor que cero.'
          : 'La cantidad debe ser un número entero mayor que cero.'
      );
    }

    const {
      data,
      error
    } =
      await this.supabaseService.client.rpc(
        'registrar_movimiento_inventario_manual',
        {
          p_id_producto:
            productoId,
          p_tipo:
            request.tipo,
          p_cantidad:
            cantidad,
          p_motivo:
            request.motivo?.trim() ||
            null
        }
      );

    if (error) {
      console.error(
        'Error al registrar movimiento:',
        error
      );

      throw new Error(
        this.traducirError(
          error.message
        )
      );
    }

    if (!data) {
      throw new Error(
        'Supabase no devolvió los datos del movimiento.'
      );
    }

    const resultado =
      data as RegistrarMovimientoDb;

    return {
      idMovimiento:
        Number(
          resultado.id_movimiento ||
          0
        ),
      productoId:
        Number(
          resultado.id_producto ||
          productoId
        ),
      producto:
        String(
          resultado.producto ||
          'Producto'
        ),
      tipo:
        resultado.tipo_movimiento ||
        (
          request.tipo ===
            'ENTRADA'
            ? 'ENTRADA_COMPRA'
            : 'AJUSTE_SALIDA'
        ),
      cantidad:
        Number(
          resultado.cantidad ||
          cantidad
        ),
      stockAnterior:
        Number(
          resultado.stock_anterior ||
          0
        ),
      stockNuevo:
        Number(
          resultado.stock_nuevo ||
          0
        ),
      usuario:
        String(
          resultado.usuario ||
          'Usuario del sistema'
        )
    };
  }

  private async obtenerUsuarioResponsableInterno():
    Promise<UsuarioResponsableMovimiento> {
    const {
      data: sesion,
      error: errorSesion
    } =
      await this.supabaseService.client.auth
        .getUser();

    if (
      errorSesion ||
      !sesion.user
    ) {
      throw new Error(
        'No se pudo identificar al usuario que inició sesión.'
      );
    }

    const {
      data,
      error
    } =
      await this.supabaseService.client
        .from('usuarios')
        .select(`
          id_usuario,
          nombres,
          apellidos,
          email
        `)
        .eq(
          'auth_user_id',
          sesion.user.id
        )
        .eq(
          'activo',
          true
        )
        .maybeSingle();

    if (error) {
      console.error(
        'Error al obtener usuario responsable:',
        error
      );

      throw new Error(
        this.traducirError(
          error.message
        )
      );
    }

    if (!data) {
      throw new Error(
        'El usuario autenticado no está vinculado con un usuario activo del sistema.'
      );
    }

    const nombre =
      [
        data.nombres,
        data.apellidos
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

    return {
      id:
        Number(
          data.id_usuario
        ),
      nombre:
        nombre ||
        data.email ||
        'Usuario del sistema',
      email:
        data.email ||
        undefined
    };
  }

  private mapearMovimiento(
    fila:
      MovimientoInventarioDb
  ): MovimientoInventario {
    const producto =
      this.obtenerRelacion<
        MovimientoProductoDb
      >(
        fila.producto
      );

    const usuario =
      this.obtenerRelacion<
        MovimientoUsuarioDb
      >(
        fila.usuario
      );

    const nombreUsuario =
      [
        usuario?.nombres,
        usuario?.apellidos
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

    return {
      id:
        Number(
          fila.id_movimiento
        ),
      fecha:
        String(
          fila.fecha_movimiento
        ),
      productoId:
        Number(
          fila.id_producto
        ),
      codigo:
        String(
          producto?.codigo_barras ||
          producto?.codigo_interno ||
          '-'
        ),
      producto:
        String(
          producto?.nombre ||
          'Producto'
        ),
      tipo:
        fila.tipo_movimiento,
      cantidad:
        Number(
          fila.cantidad ||
          0
        ),
      stockAnterior:
        Number(
          fila.stock_anterior ||
          0
        ),
      stockNuevo:
        Number(
          fila.stock_nuevo ||
          0
        ),
      motivo:
        String(
          fila.motivo ||
          'Sin motivo registrado'
        ),
      usuario:
        nombreUsuario ||
        String(
          usuario?.email ||
          'Usuario del sistema'
        ),
      referenciaTipo:
        fila.referencia_tipo ||
        undefined,
      referenciaId:
        fila.referencia_id
    };
  }

  private obtenerRelacion<T>(
    valor:
      | T
      | T[]
      | null
      | undefined
  ): T | undefined {
    if (!valor) {
      return undefined;
    }

    if (
      Array.isArray(valor)
    ) {
      return valor[0];
    }

    return valor;
  }

  private traducirError(
    mensaje: string
  ): string {
    const texto =
      String(
        mensaje ||
        ''
      )
        .normalize('NFD')
        .replace(
          /[\u0300-\u036f]/g,
          ''
        )
        .toLowerCase();

    if (
      texto.includes(
        'registrar_movimiento_inventario_manual'
      ) ||
      texto.includes(
        'could not find the function'
      ) ||
      texto.includes(
        'schema cache'
      )
    ) {
      return (
        'Falta ejecutar el archivo ' +
        '16_movimientos_inventario.sql en Supabase.'
      );
    }

    if (
      texto.includes(
        'stock insuficiente'
      )
    ) {
      return (
        'No hay stock suficiente para registrar la salida.'
      );
    }

    if (
      texto.includes(
        'producto no encontrado'
      )
    ) {
      return (
        'El producto seleccionado no existe o está inactivo.'
      );
    }

    if (
      texto.includes(
        'usuario autenticado'
      ) ||
      texto.includes(
        'usuario activo'
      )
    ) {
      return (
        'El usuario autenticado no está vinculado con un usuario activo del sistema.'
      );
    }

    if (
      texto.includes(
        'row-level security'
      ) ||
      texto.includes(
        'permission denied'
      )
    ) {
      return (
        'Tu usuario no tiene permisos para consultar o registrar movimientos.'
      );
    }

    return mensaje;
  }
}
