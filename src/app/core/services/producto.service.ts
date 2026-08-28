import { Injectable } from '@angular/core';
import {
  defer,
  Observable
} from 'rxjs';

import {
  Categoria,
  Marca,
  Producto,
  ProductoEdicionVendedorRequest,
  ProductoRequest,
  Proveedor,
  ResultadoBusquedaEscanerProducto,
  ResultadoEliminacionProducto,
  ResultadoRegistroProducto
} from '../models/producto.model';

import {
  SupabaseService
} from './supabase.service';

import {
  TokenService
} from './token.service';

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
  precio_compra?: number | string | null;
  precio_venta: number | string;
  stock_actual: number;
  stock_minimo: number;
  creado_en?: string | null;
  activo: boolean;

  categoria?:
    CategoriaDb |
    CategoriaDb[] |
    null;

  marca?:
    MarcaDb |
    MarcaDb[] |
    null;

  proveedor?:
    ProveedorDb |
    ProveedorDb[] |
    null;
}

@Injectable({
  providedIn: 'root'
})
export class ProductoService {

  private get columnasProducto(): string {
    const precioCompra =
      this.esAdministrador
        ? 'precio_compra,'
        : '';

    return `
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
    ${precioCompra}
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
  }


  constructor(
    private supabaseService:
      SupabaseService,
    private tokenService:
      TokenService
  ) {}

  private get rolActual(): string {
    return String(
      this.tokenService.getRole() || ''
    )
      .trim()
      .toUpperCase();
  }

  private get esAdministrador(): boolean {
    return this.rolActual ===
      'ADMINISTRADOR';
  }

  private get esVendedor(): boolean {
    return this.rolActual ===
      'VENDEDOR';
  }

  private exigirAdministrador(): void {
    if (!this.esAdministrador) {
      throw new Error(
        'Solo el administrador puede realizar esta acción.'
      );
    }
  }

  private exigirUsuarioProductos(): void {
    if (
      !this.esAdministrador &&
      !this.esVendedor
    ) {
      throw new Error(
        'El usuario no tiene permisos sobre productos.'
      );
    }
  }

  listar(): Observable<Producto[]> {
    return defer(async () => {
      /*
       * Supabase/PostgREST limita normalmente cada respuesta
       * a un máximo de 1000 filas.
       *
       * Como el inventario ya supera ese límite, se recuperan
       * los productos por bloques hasta completar toda la tabla.
       */
      const tamanioLote = 1000;

      const filas:
        ProductoDb[] = [];

      let desde = 0;

      while (true) {
        const hasta =
          desde +
          tamanioLote -
          1;

        const {
          data,
          error
        } =
          await this.supabaseService.client
            .from('productos')
            .select(
              this.columnasProducto
            )
            .order(
              'nombre',
              {
                ascending: true
              }
            )
            .order(
              'id_producto',
              {
                ascending: true
              }
            )
            .range(
              desde,
              hasta
            );

        if (error) {
          console.error(
            'Error al listar productos:',
            error
          );

          throw new Error(
            error.message
          );
        }

        const lote =
          (data ?? []).map(
            fila =>
              fila as unknown as
                ProductoDb
          );

        filas.push(
          ...lote
        );

        /*
         * Si el lote llega con menos de 1000 registros,
         * ya se alcanzó el final de la tabla.
         */
        if (
          lote.length <
          tamanioLote
        ) {
          break;
        }

        desde +=
          tamanioLote;
      }

      return filas.map(
        fila =>
          this.mapearProducto(
            fila
          )
      );
    });
  }

  crear(
    request: ProductoRequest
  ): Observable<ResultadoRegistroProducto> {
    return defer(
      async (): Promise<ResultadoRegistroProducto> => {
        this.exigirAdministrador();

        const codigoBarras =
          this.normalizarCodigoEscaneado(
            request.codigoBarras
          );

        const nombre =
          String(
            request.nombre || ''
          ).trim();

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
          Number(
            request.stockMinimo ?? 5
          );

        const {
          data,
          error
        } =
          await this.supabaseService.client
            .rpc(
              'crear_producto',
              {
                /*
                 * Monturas y estuches envían el código físico
                 * escaneado. Los productos simplificados pueden
                 * enviar NULL y Supabase genera un código técnico.
                 */
                p_codigo_interno:
                  request.codigoInterno
                    ?.trim() ||
                  null,
                p_codigo_barras:
                  codigoBarras,
                p_nombre:
                  nombre,
                p_descripcion:
                  request.descripcion
                    ?.trim() ||
                  null,
                p_modelo:
                  request.modelo
                    ?.trim() ||
                  null,
                p_color:
                  request.color
                    ?.trim() ||
                  null,
                p_medida:
                  request.medida
                    ?.trim() ||
                  this.normalizarMedidaEscaneada(
                    codigoBarras
                  ),
                p_material:
                  request.material
                    ?.trim() ||
                  null,
                p_precio_compra:
                  Number(
                    request.precioCompra || 0
                  ),
                p_precio_venta:
                  Number(
                    request.precioVenta || 0
                  ),
                p_stock_inicial:
                  Number(
                    request.stockActual || 0
                  ),
                p_stock_minimo:
                  Number.isFinite(
                    stockMinimo
                  )
                    ? stockMinimo
                    : 5,
                p_id_categoria:
                  Number(
                    request.categoriaId
                  ),
                p_id_marca:
                  request.marcaId
                    ? Number(
                        request.marcaId
                      )
                    : null,
                p_id_proveedor:
                  request.proveedorId
                    ? Number(
                        request.proveedorId
                      )
                    : null
              }
            );

        if (error) {
          console.error(
            'Error al crear producto:',
            error
          );

          throw new Error(
            this.traducirError(
              error.message
            )
          );
        }

        const respuesta =
          data as {
            id_producto?: number;
            accion?:
              'CREADO' |
              'STOCK_INCREMENTADO';
            cantidad_agregada?: number;
            stock_anterior?: number;
            stock_nuevo?: number;
          } | null;

        const idProducto =
          Number(
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
            respuesta
              ?.cantidad_agregada ??
            request.stockActual ??
            0
          );

        const stockAnterior =
          Number(
            respuesta
              ?.stock_anterior ??
            0
          );

        const stockNuevo =
          Number(
            respuesta
              ?.stock_nuevo ??
            cantidadAgregada
          );

        await this.guardarSexo(
          idProducto,
          request.sexo
        );

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
        this.exigirAdministrador();

        if (
          !Number.isInteger(
            idProducto
          ) ||
          idProducto <= 0
        ) {
          throw new Error(
            'El producto seleccionado no es válido.'
          );
        }

        const codigoBarras =
          this.normalizarCodigoEscaneado(
            request.codigoBarras
          );

        if (!codigoBarras) {
          throw new Error(
            'El código de barras de la montura es obligatorio.'
          );
        }

        const {
          data,
          error
        } =
          await this.supabaseService.client
            .rpc(
              'actualizar_producto_detalle',
              {
                p_id_producto:
                  idProducto,
                p_codigo_interno:
                  request.codigoInterno
                    ?.trim() ||
                  null,
                p_codigo_barras:
                  codigoBarras,
                p_nombre:
                  String(
                    request.nombre || ''
                  ).trim(),
                p_descripcion:
                  request.descripcion
                    ?.trim() ||
                  null,
                p_modelo:
                  request.modelo
                    ?.trim() ||
                  null,
                p_color:
                  request.color
                    ?.trim() ||
                  null,
                p_medida:
                  request.medida
                    ?.trim() ||
                  this.normalizarMedidaEscaneada(
                    codigoBarras
                  ),
                p_material:
                  request.material
                    ?.trim() ||
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
                    ? Number(
                        request.marcaId
                      )
                    : null,
                p_id_proveedor:
                  request.proveedorId
                    ? Number(
                        request.proveedorId
                      )
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

        await this.guardarSexo(
          idConfirmado,
          request.sexo
        );

        const producto =
          await this.obtenerPorId(
            idConfirmado
          );

        return {
          producto,
          accion:
            'ACTUALIZADO',
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

  actualizarDatosVenta(
    idProducto: number,
    request:
      ProductoEdicionVendedorRequest
  ): Observable<ResultadoRegistroProducto> {
    return defer(
      async (): Promise<ResultadoRegistroProducto> => {
        this.exigirUsuarioProductos();

        if (
          !Number.isInteger(
            idProducto
          ) ||
          idProducto <= 0
        ) {
          throw new Error(
            'El producto seleccionado no es válido.'
          );
        }

        const precioVenta =
          Number(
            request.precioVenta
          );

        if (
          !Number.isFinite(
            precioVenta
          ) ||
          precioVenta <= 0
        ) {
          throw new Error(
            'El precio de venta debe ser mayor que cero.'
          );
        }

        const {
          error
        } =
          await this.supabaseService.client
            .rpc(
              'actualizar_producto_vendedor',
              {
                p_id_producto:
                  idProducto,
                p_precio_venta:
                  precioVenta,
                p_descripcion:
                  String(
                    request.descripcion || ''
                  ).trim() ||
                  null
              }
            );

        if (error) {
          throw new Error(
            this.traducirError(
              error.message
            )
          );
        }

        const producto =
          await this.obtenerPorId(
            idProducto
          );

        return {
          producto,
          accion:
            'ACTUALIZADO',
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
        this.exigirAdministrador();

        if (
          !Number.isInteger(
            idProducto
          ) ||
          idProducto <= 0
        ) {
          throw new Error(
            'El producto seleccionado no es válido.'
          );
        }

        const {
          data,
          error
        } =
          await this.supabaseService.client
            .rpc(
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
          this.normalizarCodigoEscaneado(
            valorEscaneado
          );

        if (!valor) {
          throw new Error(
            'Ingresa o escanea un código.'
          );
        }

        /*
         * El código interno OPT sigue disponible para
         * tareas administrativas, aunque no se imprime
         * en la montura.
         */
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
            .gt(
              'stock_actual',
              0
            )
            .maybeSingle();

        if (
          porCodigoInterno.error
        ) {
          throw new Error(
            porCodigoInterno
              .error.message
          );
        }

        if (
          porCodigoInterno.data
        ) {
          return {
            tipo:
              'CODIGO_UNICO',
            valorEscaneado:
              valor,
            productos: [
              this.mapearProducto(
                porCodigoInterno
                  .data as unknown as ProductoDb
              )
            ]
          };
        }

        /*
         * El código físico de la montura puede repetirse
         * en distintas marcas. Se recuperan todas las
         * coincidencias disponibles.
         */
        const porCodigoFisico =
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
            .gt(
              'stock_actual',
              0
            );

        if (
          porCodigoFisico.error
        ) {
          throw new Error(
            porCodigoFisico
              .error.message
          );
        }

        let productos =
          (porCodigoFisico.data ?? [])
            .map(
              fila =>
                this.mapearProducto(
                  fila as unknown as ProductoDb
                )
            );

        /*
         * Compatibilidad con registros antiguos:
         * cuando no coincida codigo_barras, se intenta
         * por la medida normalizada.
         */
        if (
          productos.length === 0
        ) {
          const medida =
            this.normalizarMedidaEscaneada(
              valor
            );

          if (medida) {
            const porMedida =
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

            if (porMedida.error) {
              throw new Error(
                porMedida.error.message
              );
            }

            productos =
              (porMedida.data ?? [])
                .map(
                  fila =>
                    this.mapearProducto(
                      fila as unknown as ProductoDb
                    )
                );
          }
        }

        productos =
          this.ordenarYUnificar(
            productos
          );

        if (
          productos.length === 0
        ) {
          throw new Error(
            `No se encontraron monturas disponibles para el código ${valor}.`
          );
        }

        if (
          productos.length === 1
        ) {
          return {
            tipo:
              'CODIGO_UNICO',
            valorEscaneado:
              valor,
            productos
          };
        }

        return {
          tipo:
            'MEDIDA',
          valorEscaneado:
            valor,
          productos
        };
      }
    );
  }

  buscarPorCodigo(
    codigo: string
  ): Observable<Producto> {
    return defer(async () => {
      const valor =
        this.normalizarCodigoEscaneado(
          codigo
        );

      if (!valor) {
        throw new Error(
          'Ingresa o escanea un código.'
        );
      }

      const porInterno =
        await this.supabaseService.client
          .from('productos')
          .select(
            this.columnasProducto
          )
          .eq(
            'codigo_interno',
            valor
          )
          .limit(1);

      if (porInterno.error) {
        throw new Error(
          porInterno.error.message
        );
      }

      const filaInterna =
        porInterno.data?.[0];

      if (filaInterna) {
        return this.mapearProducto(
          filaInterna as unknown as ProductoDb
        );
      }

      const porBarras =
        await this.supabaseService.client
          .from('productos')
          .select(
            this.columnasProducto
          )
          .eq(
            'codigo_barras',
            valor
          )
          .order(
            'id_producto',
            {
              ascending: true
            }
          )
          .limit(1);

      if (porBarras.error) {
        throw new Error(
          porBarras.error.message
        );
      }

      const fila =
        porBarras.data?.[0];

      if (!fila) {
        throw new Error(
          'Producto no encontrado.'
        );
      }

      return this.mapearProducto(
        fila as unknown as ProductoDb
      );
    });
  }

  categorias():
    Observable<Categoria[]> {
    return defer(async () => {
      const {
        data,
        error
      } =
        await this.supabaseService.client
          .from('categorias')
          .select(`
            id_categoria,
            nombre,
            descripcion,
            activo
          `)
          .eq(
            'activo',
            true
          )
          .order(
            'nombre',
            {
              ascending: true
            }
          );

      if (error) {
        throw new Error(
          error.message
        );
      }

      return (data ?? []).map(
        (categoria):
          Categoria => ({
            id:
              Number(
                categoria
                  .id_categoria
              ),
            nombre:
              String(
                categoria.nombre
              ),
            descripcion:
              categoria.descripcion ??
              '',
            estado:
              Boolean(
                categoria.activo
              )
          })
      );
    });
  }

  crearCategoria(
    nombre: string
  ): Observable<Categoria> {
    return defer(async () => {
      this.exigirAdministrador();

      const nombreLimpio =
        this.normalizarNombre(
          nombre
        );

      if (
        nombreLimpio.length < 2
      ) {
        throw new Error(
          'Escribe una categoría válida.'
        );
      }

      const {
        data,
        error
      } =
        await this.supabaseService.client
          .rpc(
            'crear_categoria_si_no_existe',
            {
              p_nombre:
                nombreLimpio,
              p_descripcion:
                null
            }
          );

      if (error) {
        throw new Error(
          this.traducirError(
            error.message
          )
        );
      }

      const idCategoria =
        Number(data);

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
          .eq(
            'id_categoria',
            idCategoria
          )
          .single();

      if (
        respuesta.error ||
        !respuesta.data
      ) {
        throw new Error(
          respuesta.error
            ?.message ||
          'No se pudo consultar la categoría.'
        );
      }

      return {
        id:
          Number(
            respuesta.data
              .id_categoria
          ),
        nombre:
          String(
            respuesta.data.nombre
          ),
        descripcion:
          respuesta.data
            .descripcion ??
          '',
        estado:
          Boolean(
            respuesta.data.activo
          )
      };
    });
  }

  marcas():
    Observable<Marca[]> {
    return defer(async () => {
      const {
        data,
        error
      } =
        await this.supabaseService.client
          .from('marcas')
          .select(`
            id_marca,
            nombre,
            activo
          `)
          .eq(
            'activo',
            true
          )
          .order(
            'nombre',
            {
              ascending: true
            }
          );

      if (error) {
        throw new Error(
          error.message
        );
      }

      return (data ?? []).map(
        (marca):
          Marca => ({
            id:
              Number(
                marca.id_marca
              ),
            nombre:
              String(
                marca.nombre
              ),
            estado:
              Boolean(
                marca.activo
              )
          })
      );
    });
  }

  crearMarca(
    nombre: string
  ): Observable<Marca> {
    return defer(async () => {
      this.exigirAdministrador();

      const nombreLimpio =
        this.normalizarNombre(
          nombre
        );

      if (!nombreLimpio) {
        throw new Error(
          'Escribe una marca válida.'
        );
      }

      const {
        data,
        error
      } =
        await this.supabaseService.client
          .rpc(
            'crear_marca_si_no_existe',
            {
              p_nombre:
                nombreLimpio
            }
          );

      if (error) {
        throw new Error(
          this.traducirError(
            error.message
          )
        );
      }

      const idMarca =
        Number(data);

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
          .eq(
            'id_marca',
            idMarca
          )
          .single();

      if (
        respuesta.error ||
        !respuesta.data
      ) {
        throw new Error(
          respuesta.error
            ?.message ||
          'No se pudo consultar la marca.'
        );
      }

      return {
        id:
          Number(
            respuesta.data.id_marca
          ),
        nombre:
          String(
            respuesta.data.nombre
          ),
        estado:
          Boolean(
            respuesta.data.activo
          )
      };
    });
  }

  proveedores():
    Observable<Proveedor[]> {
    return defer(async () => {
      const {
        data,
        error
      } =
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
          .eq(
            'activo',
            true
          )
          .order(
            'razon_social',
            {
              ascending: true
            }
          );

      if (error) {
        throw new Error(
          error.message
        );
      }

      return (data ?? []).map(
        (proveedor):
          Proveedor => ({
            id:
              Number(
                proveedor
                  .id_proveedor
              ),
            razonSocial:
              proveedor
                .razon_social ??
              '',
            contacto:
              proveedor
                .nombre_contacto ??
              '',
            telefono:
              proveedor.telefono ??
              '',
            correo:
              proveedor.email ??
              '',
            direccion:
              proveedor.direccion ??
              '',
            estado:
              Boolean(
                proveedor.activo
              )
          })
      );
    });
  }

  private async guardarSexo(
    idProducto: number,
    sexo:
      'F' |
      'M' |
      null |
      undefined
  ): Promise<void> {
    if (
      sexo !== 'F' &&
      sexo !== 'M'
    ) {
      return;
    }

    const {
      error
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

    if (error) {
      console.error(
        'Error al guardar sexo:',
        error
      );

      throw new Error(
        'El producto se guardó, pero no se pudo actualizar el sexo.'
      );
    }
  }

  private async obtenerPorId(
    idProducto: number
  ): Promise<Producto> {
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
          'id_producto',
          idProducto
        )
        .single();

    if (error) {
      throw new Error(
        error.message
      );
    }

    return this.mapearProducto(
      data as unknown as ProductoDb
    );
  }

  private normalizarCodigoEscaneado(
    valor:
      string |
      null |
      undefined
  ): string {
    const original =
      String(
        valor || ''
      ).trim();

    if (!original) {
      return '';
    }

    const medida =
      this.normalizarMedidaEscaneada(
        original
      );

    /*
     * Cuando la lectura es únicamente una medida,
     * se guarda de forma uniforme: 52-18-140.
     * Un código con prefijo se conserva completo.
     */
    if (
      medida &&
      /^[0-9\s/\\|_xX×-]+$/
        .test(original)
    ) {
      return medida;
    }

    return original.toUpperCase();
  }

  private normalizarMedidaEscaneada(
    valor:
      string |
      null |
      undefined
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

  private ordenarYUnificar(
    productos: Producto[]
  ): Producto[] {
    const unicos =
      Array.from(
        new Map(
          productos.map(
            producto => [
              producto.id,
              producto
            ]
          )
        ).values()
      );

    return unicos.sort(
      (a, b) => {
        const porMarca =
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

        if (porMarca !== 0) {
          return porMarca;
        }

        const porColor =
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

        if (porColor !== 0) {
          return porColor;
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
  }

  private mapearProducto(
    fila: ProductoDb
  ): Producto {
    const categoriaDb =
      this.obtenerRelacion(
        fila.categoria
      );

    const marcaDb =
      this.obtenerRelacion(
        fila.marca
      );

    const proveedorDb =
      this.obtenerRelacion(
        fila.proveedor
      );

    return {
      id:
        Number(
          fila.id_producto
        ),
      codigoInterno:
        fila.codigo_interno ??
        '',
      codigoBarras:
        fila.codigo_barras,
      nombre:
        fila.nombre,
      descripcion:
        fila.descripcion ??
        '',
      modelo:
        fila.modelo ??
        '',
      color:
        fila.color ??
        '',
      medida:
        fila.medida ??
        '',
      material:
        fila.material ??
        '',
      sexo:
        fila.sexo === 'F' ||
        fila.sexo === 'M'
          ? fila.sexo
          : undefined,
      precioCompra:
        Number(
          fila.precio_compra ??
          0
        ),
      precioVenta:
        Number(
          fila.precio_venta ??
          0
        ),
      stockActual:
        Number(
          fila.stock_actual ??
          0
        ),
      stockMinimo:
        Number(
          fila.stock_minimo ??
          5
        ),
      fechaIngreso:
        fila.creado_en ??
        undefined,
      estado:
        Boolean(
          fila.activo
        ),

      categoria:
        categoriaDb
          ? {
              id:
                Number(
                  categoriaDb
                    .id_categoria
                ),
              nombre:
                categoriaDb.nombre,
              descripcion:
                categoriaDb
                  .descripcion ??
                '',
              estado:
                Boolean(
                  categoriaDb.activo
                )
            }
          : undefined,

      marca:
        marcaDb
          ? {
              id:
                Number(
                  marcaDb.id_marca
                ),
              nombre:
                marcaDb.nombre,
              estado:
                Boolean(
                  marcaDb.activo
                )
            }
          : undefined,

      proveedor:
        proveedorDb
          ? {
              id:
                Number(
                  proveedorDb
                    .id_proveedor
                ),
              razonSocial:
                proveedorDb
                  .razon_social ??
                '',
              contacto:
                proveedorDb
                  .nombre_contacto ??
                '',
              telefono:
                proveedorDb
                  .telefono ??
                '',
              correo:
                proveedorDb.email ??
                '',
              direccion:
                proveedorDb
                  .direccion ??
                '',
              estado:
                Boolean(
                  proveedorDb.activo
                )
            }
          : undefined
    };
  }

  private obtenerRelacion<T>(
    relacion:
      T |
      T[] |
      null |
      undefined
  ): T | null {
    if (
      Array.isArray(
        relacion
      )
    ) {
      return relacion[0] ??
        null;
    }

    return relacion ??
      null;
  }

  private normalizarNombre(
    valor: string
  ): string {
    return String(
      valor || ''
    )
      .trim()
      .replace(
        /\s+/g,
        ' '
      )
      .toUpperCase();
  }

  private traducirError(
    mensaje:
      string |
      null |
      undefined
  ): string {
    const texto =
      String(
        mensaje || ''
      ).toLowerCase();

    if (
      texto.includes(
        'actualizar_producto_detalle'
      )
    ) {
      return (
        'Falta ejecutar el archivo ' +
        '34_codigo_barras_repetible.sql en Supabase.'
      );
    }

    if (
      texto.includes(
        'crear_producto'
      ) &&
      (
        texto.includes(
          'not found'
        ) ||
        texto.includes(
          'schema cache'
        )
      )
    ) {
      return (
        'Falta ejecutar el archivo ' +
        '34_codigo_barras_repetible.sql en Supabase.'
      );
    }

    if (
      texto.includes(
        'duplicate key'
      ) &&
      texto.includes(
        'codigo_barras'
      )
    ) {
      return (
        'La base de datos todavía exige que el código físico sea único. ' +
        'Ejecuta 34_codigo_barras_repetible.sql.'
      );
    }

    if (
      texto.includes(
        'duplicate key'
      ) &&
      texto.includes(
        'codigo_interno'
      )
    ) {
      return (
        'No se pudo generar el identificador interno. ' +
        'Vuelve a guardar el producto.'
      );
    }

    if (
      texto.includes(
        'solo el administrador'
      )
    ) {
      return (
        'Solo el administrador puede realizar esta acción.'
      );
    }

    if (
      texto.includes(
        'perfil activo'
      )
    ) {
      return (
        'El usuario autenticado no tiene un perfil activo.'
      );
    }

    return mensaje ||
      'Ocurrió un error al procesar el producto.';
  }
}
