import { Injectable } from '@angular/core';
import { defer, Observable } from 'rxjs';

import {
  Categoria,
  Marca,
  Producto,
  ProductoRequest,
  Proveedor
} from '../models/producto.model';

import { SupabaseService } from './supabase.service';

interface CategoriaDb {
  id_categoria: number;
  nombre: string;
  descripcion?: string | null;
  activo: boolean;
}

interface MarcaDb {
  id_marca: number;
  nombre: string;
  activo: boolean;
}

interface ProveedorDb {
  id_proveedor: number;
  razon_social?: string | null;
  nombre_contacto?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  activo: boolean;
}

interface ProductoDb {
  id_producto: number;
  codigo_interno?: string | null;
  codigo_barras: string;
  nombre: string;
  descripcion?: string | null;
  modelo?: string | null;
  color?: string | null;
  medida?: string | null;
  material?: string | null;
  precio_compra: number | string;
  precio_venta: number | string;
  stock_actual: number;
  stock_minimo: number;
  creado_en?: string | null;
  activo: boolean;

  categoria?: CategoriaDb | CategoriaDb[] | null;
  marca?: MarcaDb | MarcaDb[] | null;
  proveedor?: ProveedorDb | ProveedorDb[] | null;
}

@Injectable({
  providedIn: 'root'
})
export class ProductoService {

  private readonly columnasProducto = `
    id_producto,
    codigo_interno,
    codigo_barras,
    nombre,
    descripcion,
    modelo,
    color,
    medida,
    material,
    precio_compra,
    precio_venta,
    stock_actual,
    stock_minimo,
    creado_en,
    activo,

    categoria:categorias (
      id_categoria,
      nombre,
      descripcion,
      activo
    ),

    marca:marcas (
      id_marca,
      nombre,
      activo
    ),

    proveedor:proveedores (
      id_proveedor,
      razon_social,
      nombre_contacto,
      telefono,
      email,
      direccion,
      activo
    )
  `;

  constructor(
    private supabaseService: SupabaseService
  ) {}

  listar(): Observable<Producto[]> {
    return defer(async () => {
      const { data, error } =
        await this.supabaseService.client
          .from('productos')
          .select(this.columnasProducto)
          .order('nombre', { ascending: true });

      if (error) {
        console.error('Error al listar productos:', error);
        throw new Error(error.message);
      }

      return (data ?? []).map((fila) =>
        this.mapearProducto(
          fila as unknown as ProductoDb
        )
      );
    });
  }

  crear(request: ProductoRequest): Observable<Producto> {
    return defer(async () => {
      const codigoBarras =
        String(request.codigoBarras || '').trim();

      const codigoInterno =
        String(
          request.codigoInterno ||
          request.codigoBarras ||
          ''
        ).trim();

      const nombre =
        String(request.nombre || '').trim();

      if (!codigoBarras) {
        throw new Error(
          'El código de barras es obligatorio.'
        );
      }

      if (!nombre) {
        throw new Error(
          'El nombre del producto es obligatorio.'
        );
      }

      if (!request.categoriaId) {
        throw new Error(
          'Selecciona una categoría.'
        );
      }

      const stockMinimo =
        Number(request.stockMinimo ?? 5);

      const { data, error } =
        await this.supabaseService.client.rpc(
          'crear_producto',
          {
            p_codigo_interno:
              codigoInterno || codigoBarras,
            p_codigo_barras:
              codigoBarras,
            p_nombre:
              nombre,
            p_descripcion:
              request.descripcion?.trim() || null,
            p_modelo:
              request.modelo?.trim() || null,
            p_color:
              request.color?.trim() || null,
            p_medida:
              request.medida?.trim() || null,
            p_material:
              request.material?.trim() || null,
            p_precio_compra:
              Number(request.precioCompra || 0),
            p_precio_venta:
              Number(request.precioVenta || 0),
            p_stock_inicial:
              Number(request.stockActual || 0),
            p_stock_minimo:
              Number.isFinite(stockMinimo)
                ? stockMinimo
                : 5,
            p_id_categoria:
              Number(request.categoriaId),
            p_id_marca:
              request.marcaId
                ? Number(request.marcaId)
                : null,
            p_id_proveedor:
              request.proveedorId
                ? Number(request.proveedorId)
                : null
          }
        );

      if (error) {
        console.error(
          'Error al crear producto:',
          error
        );

        throw new Error(
          this.traducirError(error.message)
        );
      }

      const respuesta = data as {
        id_producto?: number;
      } | null;

      const idProducto = Number(
        respuesta?.id_producto
      );

      if (!idProducto) {
        throw new Error(
          'El producto se guardó, pero no se obtuvo su identificador.'
        );
      }

      return this.obtenerPorId(idProducto);
    });
  }

  buscarPorCodigo(
    codigo: string
  ): Observable<Producto> {
    return defer(async () => {
      const codigoNormalizado =
        String(codigo || '').trim();

      if (!codigoNormalizado) {
        throw new Error(
          'Ingresa o escanea un código.'
        );
      }

      const porBarras =
        await this.supabaseService.client
          .from('productos')
          .select(this.columnasProducto)
          .eq(
            'codigo_barras',
            codigoNormalizado
          )
          .maybeSingle();

      if (porBarras.error) {
        throw new Error(
          porBarras.error.message
        );
      }

      if (porBarras.data) {
        return this.mapearProducto(
          porBarras.data as unknown as ProductoDb
        );
      }

      const porCodigoInterno =
        await this.supabaseService.client
          .from('productos')
          .select(this.columnasProducto)
          .eq(
            'codigo_interno',
            codigoNormalizado
          )
          .maybeSingle();

      if (porCodigoInterno.error) {
        throw new Error(
          porCodigoInterno.error.message
        );
      }

      if (!porCodigoInterno.data) {
        throw new Error(
          'Producto no encontrado.'
        );
      }

      return this.mapearProducto(
        porCodigoInterno.data as unknown as ProductoDb
      );
    });
  }

  categorias(): Observable<Categoria[]> {
    return defer(async () => {
      const { data, error } =
        await this.supabaseService.client
          .from('categorias')
          .select(`
            id_categoria,
            nombre,
            descripcion,
            activo
          `)
          .eq('activo', true)
          .order('nombre', { ascending: true });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []).map(
        (categoria): Categoria => ({
          id: Number(categoria.id_categoria),
          nombre: String(categoria.nombre),
          descripcion:
            categoria.descripcion ?? '',
          estado:
            Boolean(categoria.activo)
        })
      );
    });
  }

  crearCategoria(
    nombre: string
  ): Observable<Categoria> {
    return defer(async () => {
      const nombreLimpio =
        this.normalizarNombre(nombre);

      if (nombreLimpio.length < 2) {
        throw new Error(
          'Escribe una categoría válida.'
        );
      }

      const { data, error } =
        await this.supabaseService.client.rpc(
          'crear_categoria_si_no_existe',
          {
            p_nombre: nombreLimpio,
            p_descripcion: null
          }
        );

      if (error) {
        throw new Error(
          this.traducirError(error.message)
        );
      }

      const idCategoria = Number(data);

      if (!idCategoria) {
        throw new Error(
          'No se pudo obtener la categoría creada.'
        );
      }

      const respuesta =
        await this.supabaseService.client
          .from('categorias')
          .select(`
            id_categoria,
            nombre,
            descripcion,
            activo
          `)
          .eq('id_categoria', idCategoria)
          .single();

      if (
        respuesta.error ||
        !respuesta.data
      ) {
        throw new Error(
          respuesta.error?.message ||
          'No se pudo consultar la categoría.'
        );
      }

      return {
        id:
          Number(respuesta.data.id_categoria),
        nombre:
          String(respuesta.data.nombre),
        descripcion:
          respuesta.data.descripcion ?? '',
        estado:
          Boolean(respuesta.data.activo)
      };
    });
  }

  marcas(): Observable<Marca[]> {
    return defer(async () => {
      const { data, error } =
        await this.supabaseService.client
          .from('marcas')
          .select(`
            id_marca,
            nombre,
            activo
          `)
          .eq('activo', true)
          .order('nombre', { ascending: true });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []).map(
        (marca): Marca => ({
          id: Number(marca.id_marca),
          nombre: String(marca.nombre),
          estado: Boolean(marca.activo)
        })
      );
    });
  }

  crearMarca(
    nombre: string
  ): Observable<Marca> {
    return defer(async () => {
      const nombreLimpio =
        this.normalizarNombre(nombre);

      if (!nombreLimpio) {
        throw new Error(
          'Escribe una marca válida.'
        );
      }

      const { data, error } =
        await this.supabaseService.client.rpc(
          'crear_marca_si_no_existe',
          {
            p_nombre: nombreLimpio
          }
        );

      if (error) {
        throw new Error(
          this.traducirError(error.message)
        );
      }

      const idMarca = Number(data);

      if (!idMarca) {
        throw new Error(
          'No se pudo obtener la marca.'
        );
      }

      return {
        id: idMarca,
        nombre: nombreLimpio,
        estado: true
      };
    });
  }

  proveedores(): Observable<Proveedor[]> {
    return defer(async () => {
      const { data, error } =
        await this.supabaseService.client
          .from('proveedores')
          .select(`
            id_proveedor,
            razon_social,
            nombre_contacto,
            telefono,
            email,
            direccion,
            activo
          `)
          .eq('activo', true)
          .order('razon_social', {
            ascending: true
          });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []).map(
        (proveedor): Proveedor => ({
          id:
            Number(proveedor.id_proveedor),
          razonSocial:
            proveedor.razon_social ?? '',
          contacto:
            proveedor.nombre_contacto ?? '',
          telefono:
            proveedor.telefono ?? '',
          correo:
            proveedor.email ?? '',
          direccion:
            proveedor.direccion ?? '',
          estado:
            Boolean(proveedor.activo)
        })
      );
    });
  }

  private async obtenerPorId(
    idProducto: number
  ): Promise<Producto> {
    const { data, error } =
      await this.supabaseService.client
        .from('productos')
        .select(this.columnasProducto)
        .eq('id_producto', idProducto)
        .single();

    if (error) {
      throw new Error(error.message);
    }

    return this.mapearProducto(
      data as unknown as ProductoDb
    );
  }

  private mapearProducto(
    fila: ProductoDb
  ): Producto {
    const categoriaDb =
      this.obtenerRelacion(fila.categoria);

    const marcaDb =
      this.obtenerRelacion(fila.marca);

    const proveedorDb =
      this.obtenerRelacion(fila.proveedor);

    return {
      id: Number(fila.id_producto),
      codigoInterno:
        fila.codigo_interno ?? '',
      codigoBarras:
        fila.codigo_barras,
      nombre:
        fila.nombre,
      descripcion:
        fila.descripcion ?? '',
      modelo:
        fila.modelo ?? '',
      color:
        fila.color ?? '',
      medida:
        fila.medida ?? '',
      material:
        fila.material ?? '',
      precioCompra:
        Number(fila.precio_compra ?? 0),
      precioVenta:
        Number(fila.precio_venta ?? 0),
      stockActual:
        Number(fila.stock_actual ?? 0),
      stockMinimo:
        Number(fila.stock_minimo ?? 5),
      fechaIngreso:
        fila.creado_en ?? undefined,
      estado:
        Boolean(fila.activo),

      categoria:
        categoriaDb
          ? {
              id:
                Number(
                  categoriaDb.id_categoria
                ),
              nombre:
                categoriaDb.nombre,
              descripcion:
                categoriaDb.descripcion ?? '',
              estado:
                Boolean(categoriaDb.activo)
            }
          : undefined,

      marca:
        marcaDb
          ? {
              id:
                Number(marcaDb.id_marca),
              nombre:
                marcaDb.nombre,
              estado:
                Boolean(marcaDb.activo)
            }
          : undefined,

      proveedor:
        proveedorDb
          ? {
              id:
                Number(
                  proveedorDb.id_proveedor
                ),
              razonSocial:
                proveedorDb.razon_social ?? '',
              contacto:
                proveedorDb.nombre_contacto ?? '',
              telefono:
                proveedorDb.telefono ?? '',
              correo:
                proveedorDb.email ?? '',
              direccion:
                proveedorDb.direccion ?? '',
              estado:
                Boolean(proveedorDb.activo)
            }
          : undefined
    };
  }

  private obtenerRelacion<T>(
    relacion: T | T[] | null | undefined
  ): T | undefined {
    if (!relacion) {
      return undefined;
    }

    return Array.isArray(relacion)
      ? relacion[0]
      : relacion;
  }

  private normalizarNombre(
    valor: string
  ): string {
    return String(valor || '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(
        /(^|\s)\S/g,
        letra => letra.toUpperCase()
      );
  }

  private traducirError(
    mensaje: string
  ): string {
    const texto =
      String(mensaje || '').toLowerCase();

    if (
      texto.includes('duplicate') ||
      texto.includes('unique')
    ) {
      return 'Ya existe un registro con esos datos.';
    }

    if (
      texto.includes(
        'crear_categoria_si_no_existe'
      )
    ) {
      return 'Falta instalar la función para crear categorías.';
    }

    if (
      texto.includes(
        'crear_marca_si_no_existe'
      )
    ) {
      return 'Falta instalar la función para crear marcas.';
    }

    return mensaje;
  }
}
