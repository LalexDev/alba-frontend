import {
  Component,
  OnInit
} from '@angular/core';
import {
  finalize,
  Observable
} from 'rxjs';
import {
  read,
  utils,
  writeFileXLSX
} from 'xlsx';

import {
  Cliente,
  ClienteForm,
  RecetaExcelImport,
  RecetaForm,
  RecetaOptica,
  TipoDocumentoCliente
} from '../../core/models/cliente.model';

import {
  ClienteService
} from '../../core/services/cliente.service';

type ModoFormulario =
  | 'NUEVO_CLIENTE'
  | 'EDITAR_CLIENTE'
  | 'NUEVA_RECETA';

type FiltroCliente =
  | 'TODOS'
  | 'ACTIVOS'
  | 'INACTIVOS'
  | 'CONTROL_PENDIENTE'
  | 'SIN_RECETA';

@Component({
  selector: 'app-clientes-recetas',
  templateUrl: './clientes-recetas.component.html',
  styleUrls: ['./clientes-recetas.component.css']
})
export class ClientesRecetasComponent
  implements OnInit {

  clientes: Cliente[] = [];
  clienteSeleccionado: Cliente | null = null;

  search = '';
  filtro: FiltroCliente = 'TODOS';

  cargando = false;
  guardando = false;
  procesandoExcel = false;
  error = '';
  ok = '';

  mostrarFormulario = false;
  modoFormulario: ModoFormulario =
    'NUEVO_CLIENTE';

  paginaActual = 1;
  readonly tamanioPagina = 8;

  form: ClienteForm =
    this.crearFormularioVacio();

  readonly tiposDocumento:
    TipoDocumentoCliente[] = [
      'DNI',
      'CE',
      'PASAPORTE',
      'RUC',
      'SIN_DOCUMENTO'
    ];

  constructor(
    private clienteService: ClienteService
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  get totalClientes(): number {
    return this.clientes.length;
  }

  get totalRecetas(): number {
    return this.clientes.reduce(
      (total, cliente) =>
        total + cliente.recetas.length,
      0
    );
  }

  get recetasActivas(): number {
    return this.clientes.reduce(
      (total, cliente) =>
        total +
        cliente.recetas.filter(
          receta => receta.vigente
        ).length,
      0
    );
  }

  get controlesPendientes(): number {
    const hoy = this.fechaActual();

    return this.clientes.reduce(
      (total, cliente) =>
        total +
        cliente.recetas.filter(
          receta =>
            receta.vigente &&
            Boolean(receta.proximoControl) &&
            String(receta.proximoControl) <= hoy
        ).length,
      0
    );
  }

  get nuevosEsteMes(): number {
    const fecha = new Date();
    const prefijo =
      `${fecha.getFullYear()}-` +
      `${String(fecha.getMonth() + 1)
        .padStart(2, '0')}`;

    return this.clientes.filter(
      cliente =>
        String(cliente.creadoEn || '')
          .startsWith(prefijo)
    ).length;
  }

  get filtrados(): Cliente[] {
    const termino =
      this.normalizar(this.search);

    return this.clientes.filter(
      cliente => {
        if (
          this.filtro === 'ACTIVOS' &&
          !cliente.activo
        ) {
          return false;
        }

        if (
          this.filtro === 'INACTIVOS' &&
          cliente.activo
        ) {
          return false;
        }

        if (
          this.filtro === 'CONTROL_PENDIENTE' &&
          !this.tieneControlPendiente(cliente)
        ) {
          return false;
        }

        if (
          this.filtro === 'SIN_RECETA' &&
          cliente.recetas.length > 0
        ) {
          return false;
        }

        if (!termino) {
          return true;
        }

        return [
          cliente.nombreCompleto,
          cliente.numeroDocumento,
          cliente.telefono,
          cliente.correo,
          cliente.direccion,
          cliente.ultimaReceta?.numeroOrden,
          cliente.ultimaReceta?.marca
        ].some(valor =>
          this.normalizar(
            String(valor || '')
          ).includes(termino)
        );
      }
    );
  }

  get totalPaginas(): number {
    return Math.max(
      Math.ceil(
        this.filtrados.length /
        this.tamanioPagina
      ),
      1
    );
  }

  get clientesPaginados(): Cliente[] {
    if (
      this.paginaActual >
      this.totalPaginas
    ) {
      this.paginaActual =
        this.totalPaginas;
    }

    const inicio =
      (this.paginaActual - 1) *
      this.tamanioPagina;

    return this.filtrados.slice(
      inicio,
      inicio + this.tamanioPagina
    );
  }

  cargar(): void {
    this.cargando = true;
    this.error = '';

    this.clienteService.listar()
      .pipe(
        finalize(() => {
          this.cargando = false;
        })
      )
      .subscribe({
        next: (clientes: Cliente[]) => {
          this.clientes = clientes;
          this.paginaActual = 1;

          if (this.clienteSeleccionado) {
            this.clienteSeleccionado =
              clientes.find(
                cliente =>
                  cliente.id ===
                  this.clienteSeleccionado?.id
              ) ?? clientes[0] ?? null;
          } else {
            this.clienteSeleccionado =
              clientes[0] ?? null;
          }
        },

        error: (error: unknown) => {
          console.error(
            'Error al cargar clientes:',
            error
          );

          this.error =
            error instanceof Error
              ? error.message
              : 'No se pudieron cargar los clientes.';
        }
      });
  }

  abrirNuevoCliente(): void {
    this.modoFormulario =
      'NUEVO_CLIENTE';

    this.form =
      this.crearFormularioVacio();

    this.mostrarFormulario = true;
    this.error = '';
    this.ok = '';
  }

  abrirEditarCliente(
    cliente: Cliente
  ): void {
    this.modoFormulario =
      'EDITAR_CLIENTE';

    this.clienteSeleccionado = cliente;

    this.form = {
      tipoDocumento:
        cliente.tipoDocumento,
      numeroDocumento:
        cliente.numeroDocumento || '',
      nombres: cliente.nombres,
      apellidos: cliente.apellidos,
      telefono: cliente.telefono || '',
      correo: cliente.correo || '',
      direccion: cliente.direccion || '',
      fechaNacimiento:
        cliente.fechaNacimiento || '',
      observaciones:
        cliente.observaciones || '',
      incluirReceta: false,
      receta:
        this.crearRecetaVacia()
    };

    this.mostrarFormulario = true;
    this.error = '';
    this.ok = '';
  }

  abrirNuevaReceta(
    cliente?: Cliente | null
  ): void {
    const seleccionado =
      cliente || this.clienteSeleccionado;

    if (!seleccionado) {
      this.error =
        'Selecciona primero un cliente.';
      return;
    }

    this.clienteSeleccionado =
      seleccionado;

    this.modoFormulario =
      'NUEVA_RECETA';

    this.form = {
      tipoDocumento:
        seleccionado.tipoDocumento,
      numeroDocumento:
        seleccionado.numeroDocumento || '',
      nombres: seleccionado.nombres,
      apellidos: seleccionado.apellidos,
      telefono: seleccionado.telefono || '',
      correo: seleccionado.correo || '',
      direccion: seleccionado.direccion || '',
      fechaNacimiento:
        seleccionado.fechaNacimiento || '',
      observaciones:
        seleccionado.observaciones || '',
      incluirReceta: true,
      receta:
        this.crearRecetaVacia()
    };

    this.mostrarFormulario = true;
    this.error = '';
    this.ok = '';
  }

  cerrarFormulario(): void {
    if (this.guardando) {
      return;
    }

    this.mostrarFormulario = false;
    this.error = '';
  }

  recalcularDebe(): void {
    const total =
      this.numeroFormulario(
        this.form.receta.montoTotal
      );
    const cancelado =
      this.numeroFormulario(
        this.form.receta.montoCancelado
      );

    this.form.receta.montoDebe =
      Math.max(
        Number((total - cancelado).toFixed(2)),
        0
      );
  }

  guardar(): void {
    if (this.guardando) {
      return;
    }

    if (
      this.modoFormulario !==
        'NUEVA_RECETA' &&
      !this.form.nombres.trim()
    ) {
      this.error =
        'Ingresa los nombres del cliente.';
      return;
    }

    if (
      this.form.tipoDocumento === 'DNI' &&
      this.form.numeroDocumento.trim() &&
      !/^\d{8}$/.test(
        this.form.numeroDocumento.trim()
      )
    ) {
      this.error =
        'El DNI debe contener 8 números.';
      return;
    }

    if (
      this.form.telefono.trim() &&
      !/^\d{9}$/.test(
        this.form.telefono.trim()
      )
    ) {
      this.error =
        'El teléfono debe contener 9 números.';
      return;
    }

    if (
      this.modoFormulario ===
        'NUEVA_RECETA' &&
      !this.clienteSeleccionado
    ) {
      this.error =
        'No hay un cliente seleccionado.';
      return;
    }

    if (
      this.modoFormulario === 'NUEVA_RECETA' ||
      (
        this.modoFormulario === 'NUEVO_CLIENTE' &&
        this.form.incluirReceta
      )
    ) {
      this.prepararMedida();

      const cancelado =
        this.numeroFormulario(
          this.form.receta.montoCancelado
        );
      const debe =
        this.numeroFormulario(
          this.form.receta.montoDebe
        );
      const total =
        this.numeroFormulario(
          this.form.receta.montoTotal
        );

      if (
        Math.abs(
          cancelado + debe - total
        ) > 0.01
      ) {
        this.error =
          'Cancelado más debe debe ser igual al total.';
        return;
      }
    }

    this.guardando = true;
    this.error = '';
    this.ok = '';

    const modoEjecutado =
      this.modoFormulario;

    const operacion:
      Observable<Cliente | RecetaOptica> =
      modoEjecutado ===
        'NUEVO_CLIENTE'
        ? this.clienteService
            .registrarClienteConReceta(
              this.form
            )
        : modoEjecutado ===
            'EDITAR_CLIENTE'
          ? this.clienteService
              .actualizarCliente(
                this.clienteSeleccionado!.id,
                this.form
              )
          : this.clienteService
              .crearReceta(
                this.clienteSeleccionado!.id,
                this.form.receta
              );

    operacion
      .pipe(
        finalize(() => {
          this.guardando = false;
        })
      )
      .subscribe({
        next: (
          resultado: Cliente | RecetaOptica
        ) => {
          this.ok =
            modoEjecutado ===
              'NUEVO_CLIENTE'
              ? 'Cliente registrado correctamente.'
              : modoEjecutado ===
                  'EDITAR_CLIENTE'
                ? 'Cliente actualizado correctamente.'
                : 'Receta registrada correctamente.';

          if (
            modoEjecutado !==
              'NUEVA_RECETA' &&
            this.esCliente(resultado)
          ) {
            this.clienteSeleccionado =
              resultado;
          }

          this.mostrarFormulario = false;
          this.cargar();
        },

        error: (error: unknown) => {
          console.error(
            'Error al guardar cliente o receta:',
            error
          );

          this.error =
            error instanceof Error
              ? error.message
              : 'No se pudo completar la operación.';
        }
      });
  }

  descargarRecetasExcel(): void {
    const filas = this.clientes.flatMap(
      cliente =>
        cliente.recetas.map(receta => ({
          'Orden de trabajo':
            receta.numeroOrden,
          'Cliente':
            cliente.nombreCompleto,
          'Documento':
            cliente.numeroDocumento || '',
          'Fecha de entrada':
            this.fechaParaExcel(
              receta.fechaEntrada
            ),
          'Cancelado':
            receta.montoCancelado,
          'Debe':
            receta.montoDebe,
          'Total':
            receta.montoTotal,
          'Medida':
            receta.medida ||
            this.construirMedida(receta),
          'Montura':
            receta.tipoMontura || '',
          'Marca':
            receta.marca || ''
        }))
    );

    if (!filas.length) {
      this.error =
        'Todavía no hay recetas para descargar.';
      return;
    }

    const hoja =
      utils.json_to_sheet(filas);

    hoja['!cols'] = [
      { wch: 20 },
      { wch: 30 },
      { wch: 16 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 70 },
      { wch: 28 },
      { wch: 20 }
    ];

    const rango = utils.decode_range(
      hoja['!ref'] || 'A1:J1'
    );

    for (
      let fila = 1;
      fila <= rango.e.r;
      fila += 1
    ) {
      for (const columna of [4, 5, 6]) {
        const celda = hoja[
          utils.encode_cell({
            r: fila,
            c: columna
          })
        ];

        if (celda) {
          celda.z = 'S/ #,##0.00';
        }
      }
    }

    const libro = utils.book_new();
    utils.book_append_sheet(
      libro,
      hoja,
      'Recetas'
    );

    writeFileXLSX(
      libro,
      `recetas-optica-alba-${this.fechaActual()}.xlsx`
    );

    this.ok =
      'Excel de recetas descargado correctamente.';
    this.error = '';
  }

  descargarPlantillaExcel(): void {
    const hoja =
      utils.aoa_to_sheet([[
        'Orden de trabajo',
        'Cliente',
        'Documento',
        'Fecha de entrada',
        'Cancelado',
        'Debe',
        'Total',
        'Medida',
        'Montura',
        'Marca'
      ]]);

    hoja['!cols'] = [
      { wch: 20 },
      { wch: 30 },
      { wch: 16 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 70 },
      { wch: 28 },
      { wch: 20 }
    ];

    const instrucciones =
      utils.aoa_to_sheet([
        ['INSTRUCCIONES'],
        ['1. No cambies los nombres ni el orden de las columnas.'],
        ['2. Cliente es obligatorio. Documento permite evitar duplicados.'],
        ['3. Fecha de entrada: DD/MM/AAAA o AAAA-MM-DD.'],
        ['4. Cancelado + Debe debe ser igual a Total.'],
        ['5. La carga crea el cliente asociado cuando todavía no existe.'],
        ['6. Orden de trabajo vacía: el sistema genera una automáticamente.']
      ]);

    instrucciones['!cols'] = [
      { wch: 95 }
    ];

    const libro = utils.book_new();
    utils.book_append_sheet(
      libro,
      hoja,
      'Recetas'
    );
    utils.book_append_sheet(
      libro,
      instrucciones,
      'Instrucciones'
    );

    writeFileXLSX(
      libro,
      'plantilla-recetas-optica-alba.xlsx'
    );
  }

  async cargarRecetasExcel(
    event: Event
  ): Promise<void> {
    const input =
      event.target as HTMLInputElement;
    const archivo =
      input.files?.[0];

    if (!archivo) {
      return;
    }

    this.procesandoExcel = true;
    this.error = '';
    this.ok = '';

    try {
      const contenido =
        await archivo.arrayBuffer();
      const libro = read(contenido, {
        type: 'array',
        cellDates: true
      });

      const nombreHoja =
        libro.SheetNames[0];

      if (!nombreHoja) {
        throw new Error(
          'El archivo no contiene hojas.'
        );
      }

      const hoja =
        libro.Sheets[nombreHoja];
      const filasCrudas =
        utils.sheet_to_json(hoja, {
          defval: ''
        }) as Record<string, unknown>[];

      if (!filasCrudas.length) {
        throw new Error(
          'El Excel no contiene registros para importar.'
        );
      }

      const filas: RecetaExcelImport[] = [];
      const errores: string[] = [];
      const ordenesArchivo = new Set<string>();

      filasCrudas.forEach(
        (
          fila: Record<string, unknown>,
          indice: number
        ) => {
          const numeroFila = indice + 2;
          const numeroOrden =
            this.textoFila(
              fila,
              'Orden de trabajo'
            );
          const cliente =
            this.textoFila(
              fila,
              'Cliente'
            );
          const documento =
            this.textoFila(
              fila,
              'Documento'
            );
          const fechaEntrada =
            this.fechaFila(
              this.valorFila(
                fila,
                'Fecha de entrada'
              )
            );
          const cancelado =
            this.montoFila(
              this.valorFila(
                fila,
                'Cancelado'
              )
            );
          const debe =
            this.montoFila(
              this.valorFila(
                fila,
                'Debe'
              )
            );
          const total =
            this.montoFila(
              this.valorFila(
                fila,
                'Total'
              )
            );
          const medida =
            this.textoFila(
              fila,
              'Medida'
            );
          const montura =
            this.textoFila(
              fila,
              'Montura'
            );
          const marca =
            this.textoFila(
              fila,
              'Marca'
            );

          if (!cliente) {
            errores.push(
              `Fila ${numeroFila}: falta Cliente.`
            );
          }

          if (!fechaEntrada) {
            errores.push(
              `Fila ${numeroFila}: fecha de entrada inválida.`
            );
          }

          if (
            cancelado === null ||
            debe === null ||
            total === null
          ) {
            errores.push(
              `Fila ${numeroFila}: importes inválidos.`
            );
          } else if (
            Math.abs(
              cancelado + debe - total
            ) > 0.01
          ) {
            errores.push(
              `Fila ${numeroFila}: Cancelado + Debe no coincide con Total.`
            );
          }

          const ordenNormalizada =
            this.normalizar(numeroOrden);

          if (
            ordenNormalizada &&
            ordenesArchivo.has(
              ordenNormalizada
            )
          ) {
            errores.push(
              `Fila ${numeroFila}: orden de trabajo repetida en el archivo.`
            );
          }

          if (ordenNormalizada) {
            ordenesArchivo.add(
              ordenNormalizada
            );
          }

          if (
            cliente &&
            fechaEntrada &&
            cancelado !== null &&
            debe !== null &&
            total !== null &&
            Math.abs(
              cancelado + debe - total
            ) <= 0.01
          ) {
            filas.push({
              numeroOrden,
              cliente,
              documento,
              fechaEntrada,
              montoCancelado:
                cancelado,
              montoDebe:
                debe,
              montoTotal:
                total,
              medida,
              montura,
              marca
            });
          }
        }
      );

      if (errores.length) {
        throw new Error(
          errores.slice(0, 8).join(' ')
        );
      }

      const importadas = await new Promise<number>(
        (resolve, reject) => {
          this.clienteService
            .importarRecetas(filas)
            .subscribe({
              next: (cantidad: number) =>
                resolve(cantidad),
              error: (error: unknown) =>
                reject(error)
            });
        }
      );

      this.ok =
        `${importadas} receta(s) importada(s) correctamente.`;
      this.cargar();
    } catch (error: unknown) {
      console.error(
        'Error al cargar el Excel:',
        error
      );

      this.error =
        error instanceof Error
          ? error.message
          : 'No se pudo procesar el archivo Excel.';
    } finally {
      this.procesandoExcel = false;
      input.value = '';
    }
  }

  seleccionarCliente(
    cliente: Cliente
  ): void {
    this.clienteSeleccionado =
      cliente;
  }

  cambiarEstado(
    cliente: Cliente
  ): void {
    this.clienteService
      .cambiarEstado(
        cliente.id,
        !cliente.activo
      )
      .subscribe({
        next: () => {
          this.ok =
            cliente.activo
              ? 'Cliente desactivado.'
              : 'Cliente activado.';
          this.cargar();
        },
        error: (error: unknown) => {
          this.error =
            error instanceof Error
              ? error.message
              : 'No se pudo cambiar el estado.';
        }
      });
  }

  limpiarFiltros(): void {
    this.search = '';
    this.filtro = 'TODOS';
    this.paginaActual = 1;
  }

  paginaAnterior(): void {
    if (this.paginaActual > 1) {
      this.paginaActual -= 1;
    }
  }

  paginaSiguiente(): void {
    if (
      this.paginaActual <
      this.totalPaginas
    ) {
      this.paginaActual += 1;
    }
  }

  iniciales(
    cliente: Cliente
  ): string {
    const partes =
      cliente.nombreCompleto
        .split(/\s+/)
        .filter(Boolean);

    return partes
      .slice(0, 2)
      .map(parte =>
        parte[0]?.toUpperCase()
      )
      .join('');
  }

  estadoReceta(
    cliente: Cliente
  ): string {
    const receta =
      cliente.ultimaReceta;

    if (!receta) {
      return 'Sin receta';
    }

    if (!receta.vigente) {
      return 'Inactiva';
    }

    if (
      receta.proximoControl &&
      receta.proximoControl <=
        this.fechaActual()
    ) {
      return 'Revisión';
    }

    return 'Activa';
  }

  claseEstadoReceta(
    cliente: Cliente
  ): string {
    const estado =
      this.estadoReceta(cliente);

    if (estado === 'Activa') {
      return 'active';
    }

    if (estado === 'Revisión') {
      return 'review';
    }

    if (estado === 'Inactiva') {
      return 'inactive';
    }

    return 'empty';
  }

  tieneControlPendiente(
    cliente: Cliente
  ): boolean {
    return cliente.recetas.some(
      receta =>
        receta.vigente &&
        Boolean(receta.proximoControl) &&
        String(receta.proximoControl) <=
          this.fechaActual()
    );
  }

  formatearGraduacion(
    valor: number | null | undefined
  ): string {
    if (
      valor === null ||
      valor === undefined
    ) {
      return '—';
    }

    const numero = Number(valor);
    const signo = numero > 0 ? '+' : '';

    return `${signo}${numero.toFixed(2)}`;
  }

  resumenLejos(
    receta?: RecetaOptica
  ): string {
    if (!receta) {
      return 'Sin datos';
    }

    if (
      receta.lejosOdEsfera === null &&
      receta.lejosOiEsfera === null &&
      receta.medida
    ) {
      return receta.medida;
    }

    return `OD ${this.formatearGraduacion(
      receta.lejosOdEsfera
    )} / OI ${this.formatearGraduacion(
      receta.lejosOiEsfera
    )}`;
  }

  resumenCerca(
    receta?: RecetaOptica
  ): string {
    if (!receta) {
      return 'Sin datos';
    }

    return `OD ${this.formatearGraduacion(
      receta.cercaOdEsfera
    )} / OI ${this.formatearGraduacion(
      receta.cercaOiEsfera
    )}`;
  }

  private prepararMedida(): void {
    if (!this.form.receta.medida.trim()) {
      this.form.receta.medida =
        this.construirMedida(
          this.form.receta
        );
    }
  }

  private construirMedida(
    receta: RecetaForm | RecetaOptica
  ): string {
    const partes: string[] = [];

    const agregar = (
      etiqueta: string,
      valor: number | string | null | undefined
    ): void => {
      if (
        valor !== null &&
        valor !== undefined &&
        String(valor).trim() !== ''
      ) {
        partes.push(
          `${etiqueta} ${valor}`
        );
      }
    };

    agregar('LEJOS OD ESF.', receta.lejosOdEsfera);
    agregar('CYL.', receta.lejosOdCilindro);
    agregar('EJE.', receta.lejosOdEje);
    agregar('LEJOS OI ESF.', receta.lejosOiEsfera);
    agregar('CYL.', receta.lejosOiCilindro);
    agregar('EJE.', receta.lejosOiEje);
    agregar('DIP LEJOS.', receta.lejosDip);
    agregar('CERCA OD ESF.', receta.cercaOdEsfera);
    agregar('CYL.', receta.cercaOdCilindro);
    agregar('EJE.', receta.cercaOdEje);
    agregar('CERCA OI ESF.', receta.cercaOiEsfera);
    agregar('CYL.', receta.cercaOiCilindro);
    agregar('EJE.', receta.cercaOiEje);
    agregar('DIP CERCA.', receta.cercaDip);

    return partes.join(' | ');
  }

  private crearFormularioVacio():
    ClienteForm {
    return {
      tipoDocumento: 'DNI',
      numeroDocumento: '',
      nombres: '',
      apellidos: '',
      telefono: '',
      correo: '',
      direccion: '',
      fechaNacimiento: '',
      observaciones: '',
      incluirReceta: true,
      receta:
        this.crearRecetaVacia()
    };
  }

  private crearRecetaVacia():
    RecetaForm {
    return {
      numeroOrden: '',
      fechaEntrada:
        this.fechaActual(),
      montoCancelado: 0,
      montoDebe: 0,
      montoTotal: 0,
      medida: '',
      marca: '',

      fechaReceta:
        this.fechaActual(),
      profesional: '',

      lejosOdEsfera: null,
      lejosOdCilindro: null,
      lejosOdEje: null,
      lejosOiEsfera: null,
      lejosOiCilindro: null,
      lejosOiEje: null,
      lejosDip: null,

      cercaOdEsfera: null,
      cercaOdCilindro: null,
      cercaOdEje: null,
      cercaOiEsfera: null,
      cercaOiCilindro: null,
      cercaOiEje: null,
      cercaDip: null,

      adicionOd: null,
      adicionOi: null,
      agudezaVisualOd: '',
      agudezaVisualOi: '',
      tipoLente: '',
      tipoMontura: '',
      diagnostico: '',
      observaciones: '',
      proximoControl: '',
      vigente: true
    };
  }

  private esCliente(
    resultado: Cliente | RecetaOptica
  ): resultado is Cliente {
    return (
      'nombreCompleto' in resultado &&
      'recetas' in resultado
    );
  }

  private numeroFormulario(
    valor: string | number | null
  ): number {
    const numero = Number(valor ?? 0);

    return Number.isFinite(numero)
      ? numero
      : 0;
  }

  private fechaActual(): string {
    const fecha = new Date();

    return [
      fecha.getFullYear(),
      String(fecha.getMonth() + 1)
        .padStart(2, '0'),
      String(fecha.getDate())
        .padStart(2, '0')
    ].join('-');
  }

  private fechaParaExcel(
    valor: string
  ): string {
    const partes =
      String(valor || '').split('-');

    if (partes.length !== 3) {
      return valor;
    }

    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  private valorFila(
    fila: Record<string, unknown>,
    encabezado: string
  ): unknown {
    const objetivo =
      this.normalizar(encabezado);

    const clave = Object.keys(fila).find(
      actual =>
        this.normalizar(actual) === objetivo
    );

    return clave ? fila[clave] : '';
  }

  private textoFila(
    fila: Record<string, unknown>,
    encabezado: string
  ): string {
    return String(
      this.valorFila(fila, encabezado) ?? ''
    ).trim();
  }

  private montoFila(
    valor: unknown
  ): number | null {
    if (
      valor === null ||
      valor === undefined ||
      String(valor).trim() === ''
    ) {
      return 0;
    }

    let limpio = String(valor)
      .replace(/S\//gi, '')
      .replace(/\s/g, '');

    if (
      limpio.includes(',') &&
      !limpio.includes('.')
    ) {
      limpio = limpio.replace(',', '.');
    } else {
      limpio = limpio.replace(/,/g, '');
    }

    const numero = Number(limpio);

    return Number.isFinite(numero)
      ? numero
      : null;
  }

  private fechaFila(
    valor: unknown
  ): string {
    if (valor instanceof Date) {
      return [
        valor.getFullYear(),
        String(valor.getMonth() + 1)
          .padStart(2, '0'),
        String(valor.getDate())
          .padStart(2, '0')
      ].join('-');
    }

    const texto =
      String(valor ?? '').trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
      return texto;
    }

    const coincidencia = texto.match(
      /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/
    );

    if (!coincidencia) {
      return '';
    }

    const dia = coincidencia[1]
      .padStart(2, '0');
    const mes = coincidencia[2]
      .padStart(2, '0');
    const anio = coincidencia[3];

    return `${anio}-${mes}-${dia}`;
  }

  private normalizar(
    valor: string
  ): string {
    return String(valor || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }
}
