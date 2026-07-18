import { Injectable } from '@angular/core';
import { defer, Observable } from 'rxjs';

import {
  ProductoProveedorResumen,
  Proveedor,
  ProveedorForm,
  TipoDocumentoProveedor
} from '../models/proveedor.model';

import { SupabaseService } from './supabase.service';

interface ProveedorDb {
  id_proveedor: number;
  tipo_documento?: TipoDocumentoProveedor | null;
  numero_documento?: string | null;
  razon_social: string;
  nombre_contacto?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  medio_pago?: string | null;
  observaciones?: string | null;
  activo: boolean;
  creado_en?: string | null;
  actualizado_en?: string | null;
}

interface CategoriaDb {
  nombre?: string | null;
}

interface ProductoDb {
  id_producto: number;
  id_proveedor_preferido?: number | null;
  nombre?: string | null;
  stock_actual?: number | string | null;
  stock_minimo?: number | string | null;
  categoria?: CategoriaDb | CategoriaDb[] | null;
}

interface CompraDb {
  id_compra: number;
  id_proveedor: number;
  fecha_compra?: string | null;
  total?: number | string | null;
  estado?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class ProveedorService {

  private readonly columnasProveedor = `
    id_proveedor,
    tipo_documento,
    numero_documento,
    razon_social,
    nombre_contacto,
    telefono,
    email,
    direccion,
    ciudad,
    medio_pago,
    observaciones,
    activo,
    creado_en,
    actualizado_en
  `;

  constructor(
    private supabaseService: SupabaseService
  ) {}

  listar(): Observable<Proveedor[]> {
    return defer(async () => {
      const [
        proveedoresRespuesta,
        productosRespuesta,
        comprasRespuesta
      ] = await Promise.all([
        this.supabaseService.client
          .from('proveedores')
          .select(this.columnasProveedor)
          .order('razon_social', {
            ascending: true
          }),

        this.supabaseService.client
          .from('productos')
          .select(`
            id_producto,
            id_proveedor_preferido,
            nombre,
            stock_actual,
            stock_minimo,
            categoria:categorias (
              nombre
            )
          `)
          .not(
            'id_proveedor_preferido',
            'is',
            null
          )
          .eq('activo', true)
          .order('nombre', {
            ascending: true
          }),

        this.supabaseService.client
          .from('compras')
          .select(`
            id_compra,
            id_proveedor,
            fecha_compra,
            total,
            estado
          `)
          .eq('estado', 'REGISTRADA')
          .order('fecha_compra', {
            ascending: false
          })
      ]);

      const errores = [
        proveedoresRespuesta.error,
        productosRespuesta.error,
        comprasRespuesta.error
      ].filter(
        error => error !== null
      );

      if (errores.length > 0) {
        console.error(
          'Error al listar proveedores:',
          errores
        );

        throw new Error(
          errores
            .map(error => error?.message)
            .filter(Boolean)
            .join(' | ')
        );
      }

      const productosPorProveedor = new Map<
        number,
        ProductoProveedorResumen[]
      >();

      for (
        const fila of productosRespuesta.data ?? []
      ) {
        const producto =
          fila as unknown as ProductoDb;
        const idProveedor = Number(
          producto.id_proveedor_preferido ?? 0
        );

        if (!idProveedor) {
          continue;
        }

        const categoria =
          this.obtenerRelacion(
            producto.categoria
          );

        const lista =
          productosPorProveedor.get(
            idProveedor
          ) ?? [];

        lista.push({
          id: Number(producto.id_producto),
          nombre:
            producto.nombre || 'Producto',
          categoria:
            categoria?.nombre ||
            'Sin categoría',
          stockActual:
            this.numero(
              producto.stock_actual
            ),
          stockMinimo:
            this.numero(
              producto.stock_minimo
            )
        });

        productosPorProveedor.set(
          idProveedor,
          lista
        );
      }

      const comprasPorProveedor = new Map<
        number,
        CompraDb[]
      >();

      for (
        const fila of comprasRespuesta.data ?? []
      ) {
        const compra =
          fila as unknown as CompraDb;
        const idProveedor = Number(
          compra.id_proveedor
        );

        const lista =
          comprasPorProveedor.get(
            idProveedor
          ) ?? [];

        lista.push(compra);

        comprasPorProveedor.set(
          idProveedor,
          lista
        );
      }

      return (
        proveedoresRespuesta.data ?? []
      ).map(
        (fila: unknown): Proveedor => {
          const proveedorDb =
            fila as ProveedorDb;
          const idProveedor = Number(
            proveedorDb.id_proveedor
          );

          return this.mapearProveedor(
            proveedorDb,
            productosPorProveedor.get(
              idProveedor
            ) ?? [],
            comprasPorProveedor.get(
              idProveedor
            ) ?? []
          );
        }
      );
    });
  }

  crear(
    form: ProveedorForm
  ): Observable<Proveedor> {
    return defer(async () => {
      this.validarFormulario(form);

      const { data, error } =
        await this.supabaseService.client
          .from('proveedores')
          .insert(
            this.mapearFormularioDb(form)
          )
          .select(this.columnasProveedor)
          .single();

      if (error) {
        throw new Error(
          this.traducirError(error.message)
        );
      }

      return this.mapearProveedor(
        data as unknown as ProveedorDb,
        [],
        []
      );
    });
  }

  actualizar(
    idProveedor: number,
    form: ProveedorForm
  ): Observable<Proveedor> {
    return defer(async () => {
      this.validarFormulario(form);

      const { data, error } =
        await this.supabaseService.client
          .from('proveedores')
          .update(
            this.mapearFormularioDb(form)
          )
          .eq(
            'id_proveedor',
            idProveedor
          )
          .select(this.columnasProveedor)
          .single();

      if (error) {
        throw new Error(
          this.traducirError(error.message)
        );
      }

      return this.mapearProveedor(
        data as unknown as ProveedorDb,
        [],
        []
      );
    });
  }

  cambiarEstado(
    idProveedor: number,
    activo: boolean
  ): Observable<void> {
    return defer(async () => {
      const { error } =
        await this.supabaseService.client
          .from('proveedores')
          .update({ activo })
          .eq(
            'id_proveedor',
            idProveedor
          );

      if (error) {
        throw new Error(
          this.traducirError(error.message)
        );
      }
    });
  }

  private mapearProveedor(
    fila: ProveedorDb,
    productos: ProductoProveedorResumen[],
    compras: CompraDb[]
  ): Proveedor {
    const categorias = Array.from(
      new Set(
        productos
          .map(producto =>
            producto.categoria.trim()
          )
          .filter(Boolean)
      )
    ).sort(
      (a, b) =>
        a.localeCompare(
          b,
          'es',
          {
            sensitivity: 'base'
          }
        )
    );

    const ultimaCompra =
      compras.find(
        compra =>
          compra.fecha_compra
      )?.fecha_compra ?? null;

    const totalComprado =
      compras.reduce(
        (total, compra) =>
          total +
          this.numero(compra.total),
        0
      );

    return {
      id: Number(fila.id_proveedor),
      tipoDocumento:
        fila.tipo_documento ?? 'RUC',
      numeroDocumento:
        fila.numero_documento ?? '',
      razonSocial:
        fila.razon_social,
      nombreContacto:
        fila.nombre_contacto ?? '',
      telefono:
        fila.telefono ?? '',
      correo:
        fila.email ?? '',
      direccion:
        fila.direccion ?? '',
      ciudad:
        fila.ciudad ?? '',
      medioPago:
        fila.medio_pago ?? '',
      observaciones:
        fila.observaciones ?? '',
      activo:
        Boolean(fila.activo),
      creadoEn:
        fila.creado_en ?? undefined,
      actualizadoEn:
        fila.actualizado_en ?? undefined,

      productos,
      categorias,
      cantidadProductos:
        productos.length,
      productosBajoStock:
        productos.filter(
          producto =>
            producto.stockActual <=
            producto.stockMinimo
        ).length,
      ultimaCompra,
      totalComprado:
        Number(
          totalComprado.toFixed(2)
        )
    };
  }

  private mapearFormularioDb(
    form: ProveedorForm
  ): Record<string, unknown> {
    const numeroDocumento =
      form.numeroDocumento.trim();

    return {
      tipo_documento:
        form.tipoDocumento,
      numero_documento:
        numeroDocumento || null,
      razon_social:
        form.razonSocial.trim(),
      nombre_contacto:
        form.nombreContacto.trim() || null,
      telefono:
        form.telefono.trim() || null,
      email:
        form.correo
          .trim()
          .toLowerCase() || null,
      direccion:
        form.direccion.trim() || null,
      ciudad:
        form.ciudad.trim() || null,
      medio_pago:
        form.medioPago.trim() || null,
      observaciones:
        form.observaciones.trim() || null,
      activo:
        Boolean(form.activo)
    };
  }

  private validarFormulario(
    form: ProveedorForm
  ): void {
    if (!form.razonSocial.trim()) {
      throw new Error(
        'La razón social es obligatoria.'
      );
    }

    const documento =
      form.numeroDocumento.trim();

    if (
      form.tipoDocumento === 'RUC' &&
      documento &&
      !/^\d{11}$/.test(documento)
    ) {
      throw new Error(
        'El RUC debe contener 11 números.'
      );
    }

    if (
      form.tipoDocumento === 'DNI' &&
      documento &&
      !/^\d{8}$/.test(documento)
    ) {
      throw new Error(
        'El DNI debe contener 8 números.'
      );
    }

    const telefono =
      form.telefono.trim();

    if (
      telefono &&
      !/^\d{7,15}$/.test(telefono)
    ) {
      throw new Error(
        'El teléfono debe contener entre 7 y 15 números.'
      );
    }
  }

  private obtenerRelacion<T>(
    relacion:
      T |
      T[] |
      null |
      undefined
  ): T | undefined {
    if (!relacion) {
      return undefined;
    }

    if (Array.isArray(relacion)) {
      return relacion[0];
    }

    return relacion;
  }

  private numero(
    valor:
      number |
      string |
      null |
      undefined
  ): number {
    const numero = Number(valor ?? 0);

    return Number.isFinite(numero)
      ? numero
      : 0;
  }

  private traducirError(
    mensaje: string
  ): string {
    const texto =
      String(mensaje || '')
        .toLowerCase();

    if (
      texto.includes(
        'uq_proveedores_documento'
      ) ||
      (
        texto.includes('duplicate') &&
        texto.includes(
          'numero_documento'
        )
      )
    ) {
      return 'Ya existe un proveedor registrado con ese documento.';
    }

    if (
      texto.includes('ciudad') ||
      texto.includes('medio_pago') ||
      texto.includes('observaciones')
    ) {
      return 'Falta ejecutar el SQL complementario de Proveedores en Supabase.';
    }

    if (
      texto.includes(
        'row-level security'
      ) ||
      texto.includes(
        'permission denied'
      )
    ) {
      return 'Supabase bloqueó la operación. Revisa las políticas RLS de proveedores.';
    }

    return mensaje;
  }
}
