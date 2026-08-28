import {
  Component,
  OnInit
} from '@angular/core';
import {
  defer,
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

import {
  SupabaseService
} from '../../core/services/supabase.service';

import {
  TokenService
} from '../../core/services/token.service';

type ModoFormulario =
  | 'NUEVO_CLIENTE'
  | 'EDITAR_CLIENTE'
  | 'NUEVA_RECETA'
  | 'EDITAR_RECETA';

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
  cargandoFicha = false;
  error = '';
  ok = '';

  mostrarFormulario = false;
  mostrarFicha = false;

  mostrarConfirmacionEliminarCliente = false;
  clientePorEliminar: Cliente | null = null;
  eliminandoCliente = false;

  modoFormulario: ModoFormulario =
    'NUEVO_CLIENTE';

  recetaEditandoId: number | null =
    null;

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
    private clienteService: ClienteService,
    private supabaseService: SupabaseService,
    private tokenService: TokenService
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  get esAdministrador(): boolean {
    return this.tokenService.getRole() ===
      'ADMINISTRADOR';
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
    this.recetaEditandoId =
      null;

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
    this.recetaEditandoId =
      null;

    this.modoFormulario =
      'EDITAR_CLIENTE';

    this.clienteSeleccionado = cliente;

    this.form = {
      tipoDocumento:
        cliente.tipoDocumento,
      numeroDocumento:
        cliente.numeroDocumento || '',
      nombres: cliente.nombreCompleto,
      apellidos: '',
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

    this.recetaEditandoId =
      null;

    this.modoFormulario =
      'NUEVA_RECETA';

    this.form = {
      tipoDocumento:
        seleccionado.tipoDocumento,
      numeroDocumento:
        seleccionado.numeroDocumento || '',
      nombres: seleccionado.nombreCompleto,
      apellidos: '',
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

    this.form.receta.numeroOrden =
      this.generarNumeroOrdenAutomatico();

    this.actualizarProximoControlDesdeEntrada();

    this.mostrarFormulario = true;
    this.error = '';
    this.ok = '';
  }

  abrirEditarReceta(
    cliente: Cliente
  ): void {
    if (this.cargandoFicha) {
      return;
    }

    if (!cliente.ultimaReceta) {
      this.abrirNuevaReceta(
        cliente
      );
      return;
    }

    this.cargandoFicha = true;
    this.error = '';
    this.ok = '';

    /*
     * Se consulta nuevamente Supabase antes de editar.
     * Así el formulario siempre se abre con la última
     * información realmente guardada.
     */
    this.clienteService
      .obtenerPorId(
        cliente.id
      )
      .pipe(
        finalize(() => {
          this.cargandoFicha =
            false;
        })
      )
      .subscribe({
        next: (
          actualizado: Cliente
        ) => {
          const receta =
            actualizado.ultimaReceta;

          if (!receta) {
            this.error =
              'El cliente no tiene una receta para editar.';
            return;
          }

          this.clienteSeleccionado =
            actualizado;

          this.recetaEditandoId =
            receta.id;

          this.modoFormulario =
            'EDITAR_RECETA';

          this.form =
            this.crearFormularioEdicionReceta(
              actualizado,
              receta
            );

          this.mostrarFormulario =
            true;
        },

        error: (
          error: unknown
        ) => {
          console.error(
            'Error al cargar receta para editar:',
            error
          );

          this.error =
            error instanceof Error
              ? error.message
              : 'No se pudo cargar la receta para editar.';
        }
      });
  }

  abrirFicha(
    cliente: Cliente
  ): void {
    if (this.cargandoFicha) {
      return;
    }

    this.cargandoFicha = true;
    this.error = '';
    this.ok = '';

    /*
     * Se vuelve a consultar Supabase antes de abrir la ficha.
     * Así se muestran diagnóstico, tipo de lente y
     * observaciones recién guardados.
     */
    this.clienteService
      .obtenerPorId(
        cliente.id
      )
      .pipe(
        finalize(() => {
          this.cargandoFicha = false;
        })
      )
      .subscribe({
        next: (
          actualizado: Cliente
        ) => {
          this.clienteSeleccionado =
            actualizado;

          const indice =
            this.clientes.findIndex(
              item =>
                item.id ===
                actualizado.id
            );

          if (indice >= 0) {
            this.clientes[indice] =
              actualizado;
          }

          if (
            !actualizado.ultimaReceta
          ) {
            this.error =
              'El cliente todavía no tiene una receta registrada.';
            return;
          }

          this.mostrarFicha = true;
        },

        error: (
          error: unknown
        ) => {
          console.error(
            'Error al cargar la ficha:',
            error
          );

          this.error =
            error instanceof Error
              ? error.message
              : 'No se pudo cargar la ficha actualizada.';
        }
      });
  }

  cerrarFicha(): void {
    this.mostrarFicha = false;
  }

  imprimirFicha(): void {
    void this.abrirFicha70x70(
      'IMPRIMIR'
    );
  }

  descargarFichaPdf(): void {
    void this.abrirFicha70x70(
      'PDF'
    );
  }

  private async abrirFicha70x70(
    modo: 'IMPRIMIR' | 'PDF'
  ): Promise<void> {
    const cliente =
      this.clienteSeleccionado;
    const receta =
      cliente?.ultimaReceta;

    if (!cliente || !receta) {
      this.error =
        'No hay una ficha disponible para imprimir.';
      return;
    }

    // Se abre antes del await para evitar que el navegador
    // bloquee la ventana emergente.
    const ventana = window.open(
      '',
      '_blank',
      'width=520,height=620'
    );

    if (!ventana) {
      this.error =
        'El navegador bloqueó la ventana de impresión.';
      return;
    }

    ventana.document.write(`
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8">
          <title>Preparando receta...</title>
        </head>
        <body
          style="
            margin:0;
            padding:24px;
            font-family:Arial,sans-serif;
          "
        >
          Preparando formato 70 × 70 mm...
        </body>
      </html>
    `);

    ventana.document.close();

    const logo =
      await this.obtenerLogoReceta();

    const fechaTexto = String(
      receta.fechaEntrada ||
      receta.fechaReceta ||
      ''
    );

    const fechaPartes =
      fechaTexto.split('-');

    const anio =
      fechaPartes[0] || '—';
    const mes =
      fechaPartes[1] || '—';
    const dia =
      fechaPartes[2] || '—';

    const graduacion = (
      valor:
        | number
        | null
        | undefined
    ): string =>
      this.formatearGraduacion(valor);

    const valorTexto = (
      valor:
        | string
        | number
        | null
        | undefined
    ): string => {
      if (
        valor === null ||
        valor === undefined ||
        String(valor).trim() === ''
      ) {
        return '—';
      }

      return this.escapeHtml(
        String(valor)
      );
    };

    const observaciones =
      receta.observaciones ||
      cliente.observaciones ||
      '—';

    const tituloVentana =
      modo === 'PDF'
        ? `Guardar PDF - ${cliente.nombreCompleto}`
        : `Imprimir - ${cliente.nombreCompleto}`;

    ventana.document.open();

    ventana.document.write(`
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8">

          <meta
            name="viewport"
            content="width=device-width, initial-scale=1"
          >

          <title>
            ${this.escapeHtml(
              tituloVentana
            )}
          </title>

          <style>
            @page {
              size: 70mm 70mm;
              margin: 0;
            }

            * {
              box-sizing: border-box;
            }

            html,
            body {
              width: 70mm;
              height: 70mm;
              margin: 0;
              padding: 0;
              overflow: hidden;
              background: #ffffff;
            }

            body {
              color: #000000;
              font-family:
                Arial,
                Helvetica,
                sans-serif;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            .receta {
              width: 70mm;
              height: 70mm;
              padding: 1.8mm;
              overflow: hidden;
              border: 0.45mm solid #000000;
              border-radius: 4mm;
              background: #ffffff;
            }

            .marca {
              display: grid;
              justify-items: center;
              margin-bottom: 0.6mm;
              text-align: center;
            }

            .logo {
              display: block;
              width: auto;
              max-width: 38mm;
              height: 7mm;
              object-fit: contain;
              filter:
                grayscale(1)
                contrast(1.3);
            }

            .logo-fallback {
              color: #000000;
              font-size: 9pt;
              font-weight: 900;
              letter-spacing: 0.05em;
            }

            .contacto {
              margin-top: 0.25mm;
              color: #000000;
              font-size: 4.2pt;
              font-weight: 800;
              letter-spacing: 0.02em;
              white-space: nowrap;
            }

            .titulo {
              margin: 0.8mm 0 0.55mm;
              color: #000000;
              font-size: 6.1pt;
              font-weight: 900;
              letter-spacing: 0.27em;
              text-align: center;
            }

            .fecha {
              width: 29mm;
              margin: 0 auto 0.8mm;
              overflow: hidden;
              border: 0.22mm solid #000000;
              border-radius: 1.7mm;
            }

            .fecha-cabecera,
            .fecha-valores {
              display: grid;
              grid-template-columns:
                repeat(3, 1fr);
              text-align: center;
            }

            .fecha-cabecera {
              color: #000000;
              background: #ffffff;
              border-bottom:
                0.22mm solid #000000;
              font-size: 4.6pt;
              font-weight: 900;
            }

            .fecha-valores {
              color: #000000;
              font-size: 4.9pt;
              font-weight: 900;
            }

            .fecha span {
              padding: 0.45mm 0.2mm;
              border-right:
                0.18mm solid #000000;
            }

            .fecha span:last-child {
              border-right: 0;
            }

            .cliente {
              display: flex;
              align-items: flex-end;
              gap: 1mm;
              min-width: 0;
              margin-bottom: 0.75mm;
              font-size: 5.1pt;
            }

            .cliente strong {
              flex: 0 0 auto;
              color: #000000;
              font-weight: 900;
            }

            .cliente span {
              flex: 1 1 auto;
              min-width: 0;
              padding: 0 0.6mm 0.25mm;
              overflow: hidden;
              border-bottom:
                0.2mm solid #000000;
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            .cristales {
              margin-bottom: 0.4mm;
              padding: 0.35mm;
              color: #000000;
              background: #ffffff;
              border-top:
                0.22mm solid #000000;
              border-bottom:
                0.22mm solid #000000;
              font-size: 4.5pt;
              font-weight: 900;
              letter-spacing: 0.35em;
              text-align: center;
            }

            .graduacion {
              display: grid;
              grid-template-columns:
                5.2mm
                minmax(0, 1fr);
              gap: 0.55mm;
              align-items: stretch;
            }

            .lateral {
              display: grid;
              place-items: center;
              border:
                0.22mm solid #000000;
              border-radius: 1.4mm;
              color: #000000;
              background: #ffffff;
              font-size: 4.4pt;
              font-weight: 900;
              letter-spacing: 0.07em;
              writing-mode: vertical-rl;
              transform: rotate(180deg);
            }

            table {
              width: 100%;
              border-collapse: separate;
              border-spacing: 0.55mm 0.45mm;
              table-layout: fixed;
            }

            th,
            td {
              height: 3.7mm;
              padding: 0.25mm;
              overflow: hidden;
              border: 0.18mm solid #000000;
              border-radius: 0.8mm;
              font-size: 4.7pt;
              line-height: 1;
              text-align: center;
              vertical-align: middle;
              white-space: nowrap;
            }

            thead th {
              height: 2.4mm;
              padding: 0.1mm;
              border: 0;
              color: #000000;
              background: transparent;
              font-size: 4.1pt;
              font-weight: 900;
            }

            tbody th {
              width: 7mm;
              border: 0;
              color: #000000;
              background: transparent;
              font-weight: 900;
            }

            .dip {
              display: flex;
              align-items: flex-end;
              gap: 1mm;
              margin: 0.35mm 0 0.65mm
                5.8mm;
              font-size: 4.8pt;
            }

            .dip strong {
              color: #000000;
              font-weight: 900;
            }

            .dip span {
              flex: 1;
              max-width: 25mm;
              padding-bottom: 0.18mm;
              border-bottom:
                0.18mm solid #000000;
            }

            .extras {
              display: grid;
              grid-template-columns:
                repeat(2, minmax(0, 1fr));
              gap: 0.45mm 0.65mm;
              margin-bottom: 0.55mm;
            }

            .extra {
              display: flex;
              align-items: center;
              gap: 0.5mm;
              min-width: 0;
              min-height: 3mm;
              padding: 0.35mm 0.55mm;
              border:
                0.16mm solid #000000;
              border-radius: 0.7mm;
              font-size: 4.25pt;
              line-height: 1.05;
            }

            .extra strong {
              flex: 0 0 auto;
              color: #000000;
              font-size: 3.8pt;
              font-weight: 900;
              text-transform: uppercase;
            }

            .extra span {
              min-width: 0;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            .linea {
              min-height: 3.4mm;
              margin-top: 0.45mm;
              padding:
                0.35mm
                0.55mm
                0.25mm;
              overflow: hidden;
              border-bottom:
                0.18mm solid #000000;
              font-size: 4.15pt;
              line-height: 1.08;
            }

            .linea strong {
              color: #000000;
              font-size: 3.8pt;
              font-weight: 900;
              text-transform: uppercase;
            }

            .diagnostico {
              max-height: 4.2mm;
            }

            .lentes {
              max-height: 4.2mm;
            }

            .observaciones {
              min-height: 5.7mm;
              max-height: 5.7mm;
            }

            @media screen {
              body {
                background: #eeeeee;
              }

              .receta {
                box-shadow:
                  0 8px 24px
                  rgba(2, 21, 45, 0.18);
              }
            }

            @media print {
              html,
              body,
              .receta {
                width: 70mm !important;
                height: 70mm !important;
              }

              body,
              .receta {
                color: #000000 !important;
                background: #ffffff !important;
              }

              .receta {
                border-color: #000000 !important;
                box-shadow: none;
              }

              .fecha-cabecera,
              .cristales,
              .lateral {
                color: #000000 !important;
                background: #ffffff !important;
              }

              .logo {
                filter:
                  grayscale(1)
                  contrast(1.35);
              }
            }
          </style>
        </head>

        <body>
          <main class="receta">
            <header class="marca">
              ${
                logo
                  ? `
                    <img
                      class="logo"
                      src="${logo}"
                      alt="Óptica Alba"
                    >
                  `
                  : `
                    <div class="logo-fallback">
                      ÓPTICA ALBA
                    </div>
                  `
              }

              <div class="contacto">
                JR. DOS DE MAYO 964 · CEL. +51 926 474 267 · CAJAMARCA
              </div>
            </header>

            <h1 class="titulo">
              ORDEN DE TRABAJO
            </h1>

            <section class="fecha">
              <div class="fecha-cabecera">
                <span>DÍA</span>
                <span>MES</span>
                <span>AÑO</span>
              </div>

              <div class="fecha-valores">
                <span>${this.escapeHtml(dia)}</span>
                <span>${this.escapeHtml(mes)}</span>
                <span>${this.escapeHtml(anio)}</span>
              </div>
            </section>

            <section class="cliente">
              <strong>Cliente:</strong>
              <span>
                ${this.escapeHtml(
                  cliente.nombreCompleto
                )}
              </span>
            </section>

            <div class="cristales">
              CRISTALES
            </div>

            <section class="graduacion">
              <div class="lateral">
                LEJOS
              </div>

              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>ESF.</th>
                    <th>CYL.</th>
                    <th>EJE</th>
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <th>OD:</th>
                    <td>
                      ${graduacion(
                        receta.lejosOdEsfera
                      )}
                    </td>
                    <td>
                      ${graduacion(
                        receta.lejosOdCilindro
                      )}
                    </td>
                    <td>
                      ${valorTexto(
                        receta.lejosOdEje
                      )}
                    </td>
                  </tr>

                  <tr>
                    <th>OI:</th>
                    <td>
                      ${graduacion(
                        receta.lejosOiEsfera
                      )}
                    </td>
                    <td>
                      ${graduacion(
                        receta.lejosOiCilindro
                      )}
                    </td>
                    <td>
                      ${valorTexto(
                        receta.lejosOiEje
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>

            <div class="dip">
              <strong>DIP:</strong>
              <span>
                ${valorTexto(
                  receta.lejosDip
                )}
              </span>
            </div>

            <section class="extras">
              <div class="extra">
                <strong>Adic. OD</strong>
                <span>
                  ${graduacion(
                    receta.adicionOd
                  )}
                </span>
              </div>

              <div class="extra">
                <strong>Adic. OI</strong>
                <span>
                  ${graduacion(
                    receta.adicionOi
                  )}
                </span>
              </div>

              <div class="extra">
                <strong>AV OD</strong>
                <span>
                  ${valorTexto(
                    receta.agudezaVisualOd
                  )}
                </span>
              </div>

              <div class="extra">
                <strong>AV OI</strong>
                <span>
                  ${valorTexto(
                    receta.agudezaVisualOi
                  )}
                </span>
              </div>
            </section>

            <section class="linea diagnostico">
              <strong>Diagnóstico:</strong>
              ${valorTexto(
                receta.diagnostico
              )}
            </section>

            <section class="linea lentes">
              <strong>Tipo de lente / lunas:</strong>
              ${valorTexto(
                receta.tipoLente
              )}
            </section>

            <section class="linea observaciones">
              <strong>Observaciones:</strong>
              ${this.escapeHtml(
                observaciones
              )}
            </section>
          </main>

          <script>
            window.addEventListener(
              'load',
              () => {
                window.setTimeout(
                  () => {
                    window.focus();
                    window.print();
                  },
                  350
                );
              }
            );
          </script>
        </body>
      </html>
    `);

    ventana.document.close();

    this.ok =
      modo === 'PDF'
        ? 'Selecciona "Guardar como PDF" en el cuadro de impresión.'
        : 'Formato 70 × 70 mm preparado para imprimir.';
  }

  private async obtenerLogoReceta():
    Promise<string> {
    const url = new URL(
      'assets/logo-optica-alba.png',
      document.baseURI
    ).toString();

    try {
      const respuesta =
        await fetch(url);

      if (!respuesta.ok) {
        return '';
      }

      const archivo =
        await respuesta.blob();

      return await new Promise<string>(
        resolve => {
          const lector =
            new FileReader();

          lector.onload = () =>
            resolve(
              String(
                lector.result || ''
              )
            );

          lector.onerror = () =>
            resolve('');

          lector.readAsDataURL(
            archivo
          );
        }
      );
    } catch {
      return '';
    }
  }

  cerrarFormulario(): void {
    if (this.guardando) {
      return;
    }

    this.mostrarFormulario = false;
    this.recetaEditandoId =
      null;
    this.error = '';
  }

  recalcularDebe(): void {
    const total = this.numeroFormulario(
      this.form.receta.montoTotal
    );

    const cancelado = this.numeroFormulario(
      this.form.receta.montoCancelado
    );

    const debe = total - cancelado;

    this.form.receta.montoDebe = Number(
      Math.max(debe, 0).toFixed(2)
    );
  }

  guardar(): void {
    if (this.guardando) {
      return;
    }

    // El formulario usa un solo campo de nombres completos.
    this.form.tipoDocumento = 'DNI';
    this.form.apellidos = '';

    // La fecha principal de la receta es la fecha de entrada.
    this.form.receta.fechaReceta =
      this.form.receta.fechaEntrada ||
      this.fechaActual();

    if (
      this.modoFormulario ===
        'NUEVA_RECETA' &&
      !this.form.receta
        .numeroOrden
        .trim()
    ) {
      this.form.receta.numeroOrden =
        this.generarNumeroOrdenAutomatico();
    }

    if (
      this.modoFormulario ===
        'NUEVA_RECETA'
    ) {
      this.actualizarProximoControlDesdeEntrada();
    }

    // Campos eliminados de la receta.
    this.form.receta.profesional = '';
    this.form.receta.cercaOdEsfera = null;
    this.form.receta.cercaOdCilindro = null;
    this.form.receta.cercaOdEje = null;
    this.form.receta.cercaOiEsfera = null;
    this.form.receta.cercaOiCilindro = null;
    this.form.receta.cercaOiEje = null;
    this.form.receta.cercaDip = null;

    if (
      this.modoFormulario !==
        'NUEVA_RECETA' &&
      !this.form.nombres.trim()
    ) {
      this.error =
        'Ingresa los nombres completos del cliente.';
      return;
    }

    if (
      this.modoFormulario !==
        'NUEVA_RECETA' &&
      !this.form.numeroDocumento.trim()
    ) {
      this.error =
        'Ingresa el DNI del cliente.';
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
      (
        this.modoFormulario ===
          'NUEVA_RECETA' ||
        this.modoFormulario ===
          'EDITAR_RECETA'
      ) &&
      !this.clienteSeleccionado
    ) {
      this.error =
        'No hay un cliente seleccionado.';
      return;
    }

    if (
      this.modoFormulario === 'NUEVA_RECETA' ||
      this.modoFormulario === 'EDITAR_RECETA' ||
      (
        this.modoFormulario === 'NUEVO_CLIENTE' &&
        this.form.incluirReceta
      )
    ) {
      this.prepararMedida();

      const total = this.numeroFormulario(
        this.form.receta.montoTotal
      );

      const cancelado = this.numeroFormulario(
        this.form.receta.montoCancelado
      );

      if (total < 0 || cancelado < 0) {
        this.error =
          'El total y el monto cancelado no pueden ser negativos.';
        return;
      }

      if (cancelado > total) {
        this.error =
          'El monto cancelado no puede ser mayor que el total.';
        return;
      }

      // El saldo se calcula siempre desde los valores actuales.
      // No se confía en un valor anterior del campo "Debe".
      this.form.receta.montoDebe = Number(
        (total - cancelado).toFixed(2)
      );
    }

    this.guardando = true;
    this.error = '';
    this.ok = '';

    const modoEjecutado =
      this.modoFormulario;

    const operacion:
      Observable<
        Cliente |
        RecetaOptica |
        void
      > =
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
          : modoEjecutado ===
              'EDITAR_RECETA'
            ? this.actualizarRecetaActual()
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
          resultado:
            Cliente |
            RecetaOptica |
            void
        ) => {
          this.ok =
            modoEjecutado ===
              'NUEVO_CLIENTE'
              ? 'Cliente registrado correctamente.'
              : modoEjecutado ===
                  'EDITAR_CLIENTE'
                ? 'Datos del cliente actualizados correctamente.'
                : modoEjecutado ===
                    'EDITAR_RECETA'
                  ? 'Receta actualizada correctamente.'
                  : 'Receta registrada correctamente.';

          if (
            resultado &&
            modoEjecutado !==
              'NUEVA_RECETA' &&
            modoEjecutado !==
              'EDITAR_RECETA' &&
            this.esCliente(resultado)
          ) {
            this.clienteSeleccionado =
              resultado;
          }

          this.mostrarFormulario = false;
          this.recetaEditandoId =
            null;
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

  async descargarRecetasExcel():
    Promise<void> {
    const filas = this.clientes.flatMap(
      cliente =>
        cliente.recetas.map(receta => [
          this.fechaParaExcel(
            receta.fechaEntrada
          ),
          receta.numeroOrden,
          cliente.nombreCompleto,
          receta.montoTotal,
          receta.montoCancelado,
          receta.montoDebe,
          receta.medida ||
            this.construirMedida(receta),
          [
            receta.marca,
            receta.tipoMontura
          ]
            .filter(Boolean)
            .join(' - ')
        ])
    );

    if (!filas.length) {
      this.error =
        'Todavía no hay recetas para descargar.';
      return;
    }

    this.procesandoExcel = true;
    this.error = '';
    this.ok = '';

    try {
      const plantillaUrl =
        new URL(
          'assets/Formato%20receta.xlsx',
          document.baseURI
        ).toString();

      const respuesta =
        await fetch(plantillaUrl);

      if (!respuesta.ok) {
        throw new Error(
          'No se encontró la plantilla.'
        );
      }

      const buffer =
        await respuesta.arrayBuffer();

      const libro = read(
        buffer,
        {
          type: 'array',
          cellStyles: true
        }
      );

      const nombreHoja =
        libro.SheetNames[0];

      const hoja =
        libro.Sheets[nombreHoja];

      if (!hoja) {
        throw new Error(
          'La plantilla no contiene una hoja válida.'
        );
      }

      // Limpiar los datos de ejemplo conservando el formato.
      for (
        let fila = 2;
        fila < 1000;
        fila += 1
      ) {
        for (
          let columna = 0;
          columna < 8;
          columna += 1
        ) {
          const direccion =
            utils.encode_cell({
              r: fila,
              c: columna
            });

          if (hoja[direccion]) {
            delete hoja[direccion].v;
            delete hoja[direccion].w;
            delete hoja[direccion].f;
          }
        }
      }

      filas.forEach(
        (
          valores,
          indiceFila
        ) => {
          valores.forEach(
            (
              valor,
              indiceColumna
            ) => {
              const destino =
                utils.encode_cell({
                  r: indiceFila + 2,
                  c: indiceColumna
                });

              const ejemplo =
                hoja[
                  utils.encode_cell({
                    r: 2,
                    c: indiceColumna
                  })
                ];

              hoja[destino] = {
                ...(ejemplo?.s
                  ? {
                      s: ejemplo.s
                    }
                  : {}),
                t:
                  typeof valor === 'number'
                    ? 'n'
                    : 's',
                v: valor ?? ''
              };

              if (
                indiceColumna >= 3 &&
                indiceColumna <= 5
              ) {
                hoja[destino].z =
                  'S/ #,##0.00';
              }
            }
          );
        }
      );

      hoja['!ref'] =
        `A1:H${Math.max(
          filas.length + 2,
          5
        )}`;

      writeFileXLSX(
        libro,
        `formato-recetas-optica-alba-${this.fechaActual()}.xlsx`
      );

      this.ok =
        'Excel generado con el formato enviado.';
    } catch (error: unknown) {
      console.error(
        'Error al usar la plantilla:',
        error
      );

      // Respaldo con la misma estructura de ocho columnas.
      const hoja =
        utils.aoa_to_sheet([
          [
            'fecha',
            'Orden de trabajo',
            '',
            'Total ',
            'A cta.',
            'saldo',
            'Medidas ',
            ''
          ],
          [],
          ...filas
        ]);

      hoja['!cols'] = [
        { wch: 15 },
        { wch: 20 },
        { wch: 34 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 70 },
        { wch: 32 }
      ];

      const libro =
        utils.book_new();

      utils.book_append_sheet(
        libro,
        hoja,
        'Hoja1'
      );

      writeFileXLSX(
        libro,
        `formato-recetas-optica-alba-${this.fechaActual()}.xlsx`
      );

      this.ok =
        'Excel generado con la estructura del formato.';
    } finally {
      this.procesandoExcel = false;
    }
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

  solicitarEliminarCliente(
    cliente: Cliente
  ): void {
    if (!this.esAdministrador) {
      this.error =
        'Solo el administrador puede eliminar clientes.';
      return;
    }

    this.clientePorEliminar =
      cliente;
    this.mostrarConfirmacionEliminarCliente =
      true;
    this.error = '';
    this.ok = '';
  }

  cancelarEliminarCliente(): void {
    if (this.eliminandoCliente) {
      return;
    }

    this.mostrarConfirmacionEliminarCliente =
      false;
    this.clientePorEliminar =
      null;
  }

  async eliminarCliente(): Promise<void> {
    if (
      !this.esAdministrador ||
      !this.clientePorEliminar ||
      this.eliminandoCliente
    ) {
      return;
    }

    const cliente =
      this.clientePorEliminar;

    this.eliminandoCliente =
      true;
    this.error = '';
    this.ok = '';

    try {
      const {
        data,
        error
      } =
        await this.supabaseService.client
          .rpc(
            'eliminar_cliente_seguro',
            {
              p_id_cliente:
                cliente.id
            }
          );

      if (error) {
        throw new Error(
          this.traducirErrorEliminarCliente(
            error.message
          )
        );
      }

      const resultado =
        (
          data &&
          typeof data === 'object'
            ? data
            : {}
        ) as
          Record<
            string,
            unknown
          >;

      const recetasEliminadas =
        Number(
          resultado[
            'recetas_eliminadas'
          ] ||
          0
        );

      this.ok =
        recetasEliminadas > 0
          ? `Cliente eliminado junto con ${recetasEliminadas} receta(s).`
          : 'Cliente eliminado correctamente.';

      if (
        this.clienteSeleccionado?.id ===
        cliente.id
      ) {
        this.clienteSeleccionado =
          null;
      }

      this.mostrarConfirmacionEliminarCliente =
        false;
      this.clientePorEliminar =
        null;

      this.cargar();
    } catch (
      error: unknown
    ) {
      this.error =
        error instanceof Error
          ? error.message
          : 'No se pudo eliminar el cliente.';
    } finally {
      this.eliminandoCliente =
        false;
    }
  }

  private traducirErrorEliminarCliente(
    mensaje: string
  ): string {
    const texto =
      String(
        mensaje || ''
      )
        .toLowerCase();

    if (
      texto.includes(
        'ventas u ordenes'
      ) ||
      texto.includes(
        'ventas u órdenes'
      )
    ) {
      return 'Este cliente tiene ventas u órdenes registradas. No se puede eliminar; puedes desactivarlo para conservar el historial.';
    }

    if (
      texto.includes(
        'solo el administrador'
      )
    ) {
      return 'Solo el administrador puede eliminar clientes.';
    }

    if (
      texto.includes(
        'foreign key'
      ) ||
      texto.includes(
        'violates foreign key'
      )
    ) {
      return 'El cliente tiene información relacionada y no puede eliminarse de forma segura. Desactívalo para conservar el historial.';
    }

    if (
      texto.includes(
        'eliminar_cliente_seguro'
      ) ||
      texto.includes(
        'schema cache'
      )
    ) {
      return 'Falta ejecutar 38_eliminar_cliente_seguro.sql en Supabase.';
    }

    return mensaje ||
      'No se pudo eliminar el cliente.';
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

    agregar('OD ESF.', receta.lejosOdEsfera);
    agregar('OD CYL.', receta.lejosOdCilindro);
    agregar('OD EJE.', receta.lejosOdEje);
    agregar('OI ESF.', receta.lejosOiEsfera);
    agregar('OI CYL.', receta.lejosOiCilindro);
    agregar('OI EJE.', receta.lejosOiEje);
    agregar('DIP.', receta.lejosDip);

    return partes.join(' | ');
  }

  actualizarProximoControlDesdeEntrada():
    void {
    const fechaEntrada =
      this.form.receta
        .fechaEntrada ||
      this.fechaActual();

    this.form.receta.proximoControl =
      this.fechaUnAnioDespues(
        fechaEntrada
      );
  }

  private generarNumeroOrdenAutomatico():
    string {
    let maximo = 0;

    this.clientes.forEach(
      cliente => {
        cliente.recetas.forEach(
          receta => {
            const coincidencia =
              String(
                receta.numeroOrden ||
                ''
              )
                .trim()
                .toUpperCase()
                .match(
                  /^OT-(\d+)$/
                );

            if (!coincidencia) {
              return;
            }

            const numero =
              Number(
                coincidencia[1]
              );

            if (
              Number.isInteger(
                numero
              ) &&
              numero > maximo
            ) {
              maximo = numero;
            }
          }
        );
      }
    );

    return (
      'OT-' +
      String(
        maximo + 1
      ).padStart(
        6,
        '0'
      )
    );
  }

  private fechaUnAnioDespues(
    fechaIso: string
  ): string {
    const partes =
      String(
        fechaIso || ''
      )
        .split('-')
        .map(
          valor =>
            Number(valor)
        );

    if (
      partes.length !== 3 ||
      !partes[0] ||
      !partes[1] ||
      !partes[2]
    ) {
      return '';
    }

    const [
      anio,
      mes,
      dia
    ] = partes;

    const nuevoAnio =
      anio + 1;

    /*
     * Si la fecha fuera 29/02 y el siguiente año no es bisiesto,
     * se usa 28/02 para mantener el control al cierre de febrero.
     */
    const ultimoDiaMes =
      new Date(
        nuevoAnio,
        mes,
        0
      ).getDate();

    const diaSeguro =
      Math.min(
        dia,
        ultimoDiaMes
      );

    return [
      nuevoAnio,
      String(mes)
        .padStart(
          2,
          '0'
        ),
      String(diaSeguro)
        .padStart(
          2,
          '0'
        )
    ].join('-');
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
    const fechaEntrada =
      this.fechaActual();

    return {
      numeroOrden:
        this.generarNumeroOrdenAutomatico(),
      fechaEntrada,
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
      proximoControl:
        this.fechaUnAnioDespues(
          fechaEntrada
        ),
      vigente: true
    };
  }

  private crearFormularioEdicionReceta(
    cliente: Cliente,
    receta: RecetaOptica
  ): ClienteForm {
    return {
      tipoDocumento:
        cliente.tipoDocumento,
      numeroDocumento:
        cliente.numeroDocumento || '',
      nombres:
        cliente.nombreCompleto,
      apellidos: '',
      telefono:
        cliente.telefono || '',
      correo:
        cliente.correo || '',
      direccion:
        cliente.direccion || '',
      fechaNacimiento:
        cliente.fechaNacimiento || '',
      observaciones:
        cliente.observaciones || '',
      incluirReceta: true,
      receta: {
        numeroOrden:
          receta.numeroOrden || '',
        fechaEntrada:
          receta.fechaEntrada ||
          receta.fechaReceta ||
          this.fechaActual(),
        montoCancelado:
          receta.montoCancelado ?? 0,
        montoDebe:
          receta.montoDebe ?? 0,
        montoTotal:
          receta.montoTotal ?? 0,
        medida:
          receta.medida || '',
        marca:
          receta.marca || '',

        fechaReceta:
          receta.fechaReceta ||
          receta.fechaEntrada ||
          this.fechaActual(),
        profesional:
          receta.profesional || '',

        lejosOdEsfera:
          receta.lejosOdEsfera ?? null,
        lejosOdCilindro:
          receta.lejosOdCilindro ?? null,
        lejosOdEje:
          receta.lejosOdEje ?? null,
        lejosOiEsfera:
          receta.lejosOiEsfera ?? null,
        lejosOiCilindro:
          receta.lejosOiCilindro ?? null,
        lejosOiEje:
          receta.lejosOiEje ?? null,
        lejosDip:
          receta.lejosDip ?? null,

        cercaOdEsfera:
          receta.cercaOdEsfera ?? null,
        cercaOdCilindro:
          receta.cercaOdCilindro ?? null,
        cercaOdEje:
          receta.cercaOdEje ?? null,
        cercaOiEsfera:
          receta.cercaOiEsfera ?? null,
        cercaOiCilindro:
          receta.cercaOiCilindro ?? null,
        cercaOiEje:
          receta.cercaOiEje ?? null,
        cercaDip:
          receta.cercaDip ?? null,

        adicionOd:
          receta.adicionOd ?? null,
        adicionOi:
          receta.adicionOi ?? null,
        agudezaVisualOd:
          receta.agudezaVisualOd || '',
        agudezaVisualOi:
          receta.agudezaVisualOi || '',
        tipoLente:
          receta.tipoLente || '',
        tipoMontura:
          receta.tipoMontura || '',
        diagnostico:
          receta.diagnostico || '',
        observaciones:
          receta.observaciones || '',
        proximoControl:
          receta.proximoControl ||
          this.fechaUnAnioDespues(
            receta.fechaEntrada ||
            receta.fechaReceta ||
            this.fechaActual()
          ),
        vigente:
          receta.vigente
      }
    };
  }

  private actualizarRecetaActual():
    Observable<void> {
    return defer(async () => {
      if (
        !this.recetaEditandoId ||
        !this.clienteSeleccionado
      ) {
        throw new Error(
          'No hay una receta seleccionada para actualizar.'
        );
      }

      const receta =
        this.form.receta;

      const total =
        Math.max(
          this.numeroFormulario(
            receta.montoTotal
          ),
          0
        );

      const cancelado =
        Math.min(
          Math.max(
            this.numeroFormulario(
              receta.montoCancelado
            ),
            0
          ),
          total
        );

      const debe =
        Number(
          (
            total -
            cancelado
          ).toFixed(2)
        );

      const {
        error
      } =
        await this.supabaseService.client
          .from(
            'recetas_opticas'
          )
          .update({
            numero_orden:
              receta.numeroOrden
                .trim() ||
              null,
            fecha_entrada:
              receta.fechaEntrada ||
              receta.fechaReceta ||
              this.fechaActual(),
            monto_cancelado:
              cancelado,
            monto_debe:
              debe,
            monto_total:
              total,
            medida:
              receta.medida
                .trim() ||
              null,
            marca:
              receta.marca
                .trim() ||
              null,
            fecha_receta:
              receta.fechaReceta ||
              receta.fechaEntrada ||
              this.fechaActual(),
            profesional:
              receta.profesional
                .trim() ||
              null,

            lejos_od_esfera:
              this.numeroNullableFormulario(
                receta.lejosOdEsfera
              ),
            lejos_od_cilindro:
              this.numeroNullableFormulario(
                receta.lejosOdCilindro
              ),
            lejos_od_eje:
              this.numeroNullableFormulario(
                receta.lejosOdEje
              ),
            lejos_oi_esfera:
              this.numeroNullableFormulario(
                receta.lejosOiEsfera
              ),
            lejos_oi_cilindro:
              this.numeroNullableFormulario(
                receta.lejosOiCilindro
              ),
            lejos_oi_eje:
              this.numeroNullableFormulario(
                receta.lejosOiEje
              ),
            lejos_dip:
              this.numeroNullableFormulario(
                receta.lejosDip
              ),

            cerca_od_esfera:
              this.numeroNullableFormulario(
                receta.cercaOdEsfera
              ),
            cerca_od_cilindro:
              this.numeroNullableFormulario(
                receta.cercaOdCilindro
              ),
            cerca_od_eje:
              this.numeroNullableFormulario(
                receta.cercaOdEje
              ),
            cerca_oi_esfera:
              this.numeroNullableFormulario(
                receta.cercaOiEsfera
              ),
            cerca_oi_cilindro:
              this.numeroNullableFormulario(
                receta.cercaOiCilindro
              ),
            cerca_oi_eje:
              this.numeroNullableFormulario(
                receta.cercaOiEje
              ),
            cerca_dip:
              this.numeroNullableFormulario(
                receta.cercaDip
              ),

            adicion_od:
              this.numeroNullableFormulario(
                receta.adicionOd
              ),
            adicion_oi:
              this.numeroNullableFormulario(
                receta.adicionOi
              ),

            agudeza_visual_od:
              receta.agudezaVisualOd
                .trim() ||
              null,
            agudeza_visual_oi:
              receta.agudezaVisualOi
                .trim() ||
              null,
            tipo_lente:
              receta.tipoLente
                .trim() ||
              null,
            tipo_montura:
              receta.tipoMontura
                .trim() ||
              null,
            diagnostico:
              receta.diagnostico
                .trim() ||
              null,
            observaciones:
              receta.observaciones
                .trim() ||
              null,
            proximo_control:
              receta.proximoControl ||
              null,
            vigente:
              Boolean(
                receta.vigente
              )
          })
          .eq(
            'id_receta',
            this.recetaEditandoId
          )
          .eq(
            'id_cliente',
            this.clienteSeleccionado.id
          );

      if (error) {
        if (
          String(
            error.message ||
            ''
          )
            .toLowerCase()
            .includes(
              'numero_orden'
            )
        ) {
          throw new Error(
            'Ya existe otra receta con ese número de orden.'
          );
        }

        throw new Error(
          error.message
        );
      }
    });
  }

  private numeroNullableFormulario(
    valor:
      string |
      number |
      null |
      undefined
  ): number | null {
    if (
      valor === null ||
      valor === undefined ||
      String(valor).trim() ===
        ''
    ) {
      return null;
    }

    const numero =
      Number(
        String(valor)
          .replace(',', '.')
      );

    return Number.isFinite(
      numero
    )
      ? numero
      : null;
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

  private escapeHtml(
    valor: string
  ): string {
    return String(valor || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
