import { Injectable } from '@angular/core';
import { defer, Observable } from 'rxjs';

import {
  Categoria,
  Marca,
  Producto,
  ProductoRequest,
  Proveedor,
  ResultadoBusquedaEscanerProducto,
  ResultadoEliminacionProducto,
  ResultadoRegistroProducto
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
  sexo?: string | null;
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
    sexo,
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

  crear(
    request: ProductoRequest
  ): Observable<ResultadoRegistroProducto> {
    return defer(
      async (): Promise<ResultadoRegistroProducto> => {
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
              codigoInterno ||
              codigoBarras ||
              null,
            p_codigo_barras:
              codigoBarras ||
              null,
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
        accion?:
          'CREADO' |
          'STOCK_INCREMENTADO';
        cantidad_agregada?: number;
        stock_anterior?: number;
        stock_nuevo?: number;
      } | null;

      const idProducto = Number(
        respuesta?.id_producto
      );

      if (!idProducto) {
        throw new Error(
          'El producto se guardó, pero no se obtuvo su identificador.'
        );
      }

      const accion:
        ResultadoRegistroProducto['accion'] =
          respuesta?.accion ===
            'STOCK_INCREMENTADO'
            ? 'STOCK_INCREMENTADO'
            : 'CREADO';

      const cantidadAgregada =
        Number(
          respuesta?.cantidad_agregada ??
          request.stockActual ??
          0
        );

      const stockAnterior =
        Number(
          respuesta?.stock_anterior ??
          0
        );

      const stockNuevo =
        Number(
          respuesta?.stock_nuevo ??
          cantidadAgregada
        );

      const sexo =
        request.sexo === 'F' ||
        request.sexo === 'M'
          ? request.sexo
          : null;

      if (sexo) {
        const {
          error: errorSexo
        } =
          await this.supabaseService.client
            .rpc(
              'actualizar_sexo_producto',
              {
                p_id_producto:
                  idProducto,
                p_sexo:
                  sexo
              }
            );

        if (errorSexo) {
          console.error(
            'Error al guardar sexo:',
            errorSexo
          );

          throw new Error(
            'El producto se creó, pero no se pudo guardar el sexo. Ejecuta el SQL 11_productos_sexo.sql.'
          );
        }
      }

      const producto =
        await this.obtenerPorId(
          idProducto
        );

      return {
        producto,
        accion,
        cantidadAgregada,
        stockAnterior,
        stockNuevo
      };
      }
    );
  }

  actualizar(
    idProducto: number,
    request: ProductoRequest
  ): Observable<ResultadoRegistroProducto> {
    return defer(
      async (): Promise<ResultadoRegistroProducto> => {
      if (
        !Number.isInteger(idProducto) ||
        idProducto <= 0
      ) {
        throw new Error(
          'El producto seleccionado no es válido.'
        );
      }

      const { data, error } =
        await this.supabaseService.client.rpc(
          'actualizar_producto_detalle',
          {
            p_id_producto:
              idProducto,
            p_codigo_interno:
              String(
                request.codigoInterno ||
                request.codigoBarras ||
                ''
              ).trim(),
            p_codigo_barras:
              String(
                request.codigoBarras || ''
              ).trim(),
            p_nombre:
              String(
                request.nombre || ''
              ).trim(),
            p_descripcion:
              request.descripcion?.trim() ||
              null,
            p_modelo:
              request.modelo?.trim() ||
              null,
            p_color:
              request.color?.trim() ||
              null,
            p_medida:
              request.medida?.trim() ||
              null,
            p_material:
              request.material?.trim() ||
              null,
            p_sexo:
              request.sexo === 'F' ||
              request.sexo === 'M'
                ? request.sexo
                : null,
            p_precio_compra:
              Number(
                request.precioCompra || 0
              ),
            p_precio_venta:
              Number(
                request.precioVenta || 0
              ),
            p_stock_minimo:
              Number(
                request.stockMinimo ?? 5
              ),
            p_id_categoria:
              Number(
                request.categoriaId
              ),
            p_id_marca:
              request.marcaId
                ? Number(request.marcaId)
                : null,
            p_id_proveedor:
              request.proveedorId
                ? Number(request.proveedorId)
                : null,
            p_activo:
              true
          }
        );

      if (error) {
        throw new Error(
          this.traducirError(
            error.message
          )
        );
      }

      const idConfirmado =
        Number(
          (
            data as {
              id_producto?: number;
            } | null
          )?.id_producto ||
          idProducto
        );

      const producto =
        await this.obtenerPorId(
          idConfirmado
        );

      return {
        producto,
        accion:
          'ACTUALIZADO' as const,
        cantidadAgregada:
          0,
        stockAnterior:
          producto.stockActual,
        stockNuevo:
          producto.stockActual
      };
      }
    );
  }

  eliminar(
    idProducto: number
  ): Observable<ResultadoEliminacionProducto> {
    return defer(
      async (): Promise<ResultadoEliminacionProducto> => {
      if (
        !Number.isInteger(idProducto) ||
        idProducto <= 0
      ) {
        throw new Error(
          'El producto seleccionado no es válido.'
        );
      }

      const { data, error } =
        await this.supabaseService.client.rpc(
          'eliminar_producto_seguro',
          {
            p_id_producto:
              idProducto
          }
        );

      if (error) {
        throw new Error(
          this.traducirError(
            error.message
          )
        );
      }

      const respuesta =
        data as {
          id_producto?: number;
          accion?: string;
          mensaje?: string;
        } | null;

      const accion:
        ResultadoEliminacionProducto['accion'] =
          respuesta?.accion ===
            'DESACTIVADO'
            ? 'DESACTIVADO'
            : 'ELIMINADO';

      return {
        idProducto:
          Number(
            respuesta?.id_producto ||
            idProducto
          ),
        accion,
        mensaje:
          respuesta?.mensaje ||
          (
            accion === 'ELIMINADO'
              ? 'Producto eliminado.'
              : 'Producto desactivado para conservar su historial.'
          )
      };
      }
    );
  }

  buscarParaVentaPorEscaneo(
    valorEscaneado: string
  ): Observable<ResultadoBusquedaEscanerProducto> {
    return defer(
      async (): Promise<ResultadoBusquedaEscanerProducto> => {
        const valor =
          String(
            valorEscaneado || ''
          ).trim();

        if (!valor) {
          throw new Error(
            'Ingresa o escanea un código.'
          );
        }

        /*
         * Cuando la lectura tiene formato de medida, siempre
         * buscamos TODAS las monturas que comparten esa medida.
         *
         * Ejemplo:
         * 52-18-140
         */
        const medida =
          this.normalizarMedidaEscaneada(
            valor
          );

        if (medida) {
          const {
            data,
            error
          } =
            await this.supabaseService.client
              .from('productos')
              .select(
                this.columnasProducto
              )
              .eq(
                'activo',
                true
              )
              .eq(
                'medida',
                medida
              )
              .gt(
                'stock_actual',
                0
              );

          if (error) {
            throw new Error(
              error.message
            );
          }

          const productos =
            (data ?? [])
              .map(
                fila =>
                  this.mapearProducto(
                    fila as unknown as ProductoDb
                  )
              )
              .sort(
                (a, b) => {
                  const marca =
                    String(
                      a.marca?.nombre || ''
                    ).localeCompare(
                      String(
                        b.marca?.nombre || ''
                      ),
                      'es',
                      {
                        sensitivity:
                          'base'
                      }
                    );

                  if (marca !== 0) {
                    return marca;
                  }

                  const color =
                    String(
                      a.color || ''
                    ).localeCompare(
                      String(
                        b.color || ''
                      ),
                      'es',
                      {
                        sensitivity:
                          'base'
                      }
                    );

                  if (color !== 0) {
                    return color;
                  }

                  return String(
                    a.modelo || ''
                  ).localeCompare(
                    String(
                      b.modelo || ''
                    ),
                    'es',
                    {
                      sensitivity:
                        'base',
                      numeric:
                        true
                    }
                  );
                }
              );

          if (productos.length === 0) {
            throw new Error(
              `No hay monturas con stock para la medida ${medida}.`
            );
          }

          return {
            tipo:
              'MEDIDA',
            valorEscaneado:
              medida,
            productos
          };
        }

        /*
         * Un código interno OPT sí identifica exactamente
         * a un solo producto.
         */
        const porBarras =
          await this.supabaseService.client
            .from('productos')
            .select(
              this.columnasProducto
            )
            .eq(
              'activo',
              true
            )
            .eq(
              'codigo_barras',
              valor
            )
            .maybeSingle();

        if (porBarras.error) {
          throw new Error(
            porBarras.error.message
          );
        }

        let filaExacta =
          porBarras.data;

        if (!filaExacta) {
          const porCodigoInterno =
            await this.supabaseService.client
              .from('productos')
              .select(
                this.columnasProducto
              )
              .eq(
                'activo',
                true
              )
              .eq(
                'codigo_interno',
                valor
              )
              .maybeSingle();

          if (porCodigoInterno.error) {
            throw new Error(
              porCodigoInterno.error.message
            );
          }

          filaExacta =
            porCodigoInterno.data;
        }

        if (!filaExacta) {
          throw new Error(
            'Producto no encontrado.'
          );
        }

        const producto =
          this.mapearProducto(
            filaExacta as unknown as ProductoDb
          );

        if (
          Number(
            producto.stockActual || 0
          ) <= 0
        ) {
          throw new Error(
            'El producto está agotado.'
          );
        }

        return {
          tipo:
            'CODIGO_UNICO',
          valorEscaneado:
            valor,
          productos: [
            producto
          ]
        };
      }
    );
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

      const respuesta =
        await this.supabaseService.client
          .from('marcas')
          .select(`
            id_marca,
            nombre,
            activo
          `)
          .eq('id_marca', idMarca)
          .single();

      if (
        respuesta.error ||
        !respuesta.data
      ) {
        throw new Error(
          respuesta.error?.message ||
          'No se pudo consultar la marca.'
        );
      }

      return {
        id:
          Number(respuesta.data.id_marca),
        nombre:
          String(respuesta.data.nombre),
        estado:
          Boolean(respuesta.data.activo)
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

  private normalizarMedidaEscaneada(
    valor: string
  ): string | null {
    const texto =
      String(
        valor || ''
      )
        .trim()
        .toUpperCase()
        .replace(
          /[×X]/g,
          '-'
        )
        .replace(
          /[\/\\|_]/g,
          '-'
        )
        .replace(
          /\s+/g,
          '-'
        )
        .replace(
          /-+/g,
          '-'
        );

    const coincidencia =
      texto.match(
        /(?:^|[^0-9])(\d{2,3})-(\d{2,3})-(\d{3})(?:$|[^0-9])/
      );

    if (coincidencia) {
      return [
        coincidencia[1],
        coincidencia[2],
        coincidencia[3]
      ].join('-');
    }

    const soloDigitos =
      String(
        valor || ''
      ).replace(
        /\D/g,
        ''
      );

    if (
      soloDigitos.length === 7
    ) {
      return [
        soloDigitos.slice(0, 2),
        soloDigitos.slice(2, 4),
        soloDigitos.slice(4, 7)
      ].join('-');
    }

    return null;
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
      sexo:
        fila.sexo === 'F' ||
        fila.sexo === 'M'
          ? fila.sexo
          : undefined,
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
      texto.includes(
        'actualizar_producto_detalle'
      ) ||
      texto.includes(
        'eliminar_producto_seguro'
      )
    ) {
      return (
        'Falta ejecutar el archivo ' +
        '29_productos_visualizar_editar_eliminar.sql en Supabase.'
      );
    }

    if (
      texto.includes(
        'producto con ventas'
      )
    ) {
      return (
        'El producto tiene historial de ventas y solo puede desactivarse.'
      );
    }

    if (
      texto.includes(
        'productos_siempre_sumar_stock'
      )
    ) {
      return (
        'Falta ejecutar el archivo ' +
        '31_productos_siempre_sumar_stock.sql en Supabase.'
      );
    }

    if (
      texto.includes(
        'registrar_producto_o_incrementar_stock'
      )
    ) {
      return (
        'Falta ejecutar el archivo ' +
        '28_productos_modelos_stock_automatico.sql en Supabase.'
      );
    }

    if (
      texto.includes(
        'mismo producto, modelo, color y medida'
      )
    ) {
      return (
        'No se pudo sumar la cantidad al stock existente. ' +
        'Ejecuta el archivo 31_productos_siempre_sumar_stock.sql en Supabase.'
      );
    }

    if (
      texto.includes(
        'codigo_barras'
      ) ||
      texto.includes(
        'código de barras'
      )
    ) {
      return (
        'El código único ya pertenece a otro producto. ' +
        'Presiona Generar para obtener un nuevo código OPT.'
      );
    }

    if (
      texto.includes(
        'codigo_interno'
      ) ||
      texto.includes(
        'código interno'
      )
    ) {
      return (
        'El código interno ya está registrado. ' +
        'Vuelve a generar el código del producto.'
      );
    }

    if (
      texto.includes('duplicate') ||
      texto.includes('unique')
    ) {
      return (
        'Existe un dato único repetido. Revisa el código del producto; ' +
        'la marca puede reutilizarse con modelos diferentes.'
      );
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
