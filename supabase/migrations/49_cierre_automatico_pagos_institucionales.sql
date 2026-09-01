-- Óptica Alba
-- Cierre automático, pagos institucionales completos y pagos externos.
-- Ejecutar una sola vez en Supabase SQL Editor antes de publicar el frontend.

BEGIN;

ALTER TABLE public.movimientos_caja
  ADD COLUMN IF NOT EXISTS metodo_pago TEXT;

ALTER TABLE public.movimientos_caja
  ADD COLUMN IF NOT EXISTS es_pago_externo BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.movimientos_caja
  ALTER COLUMN metodo_pago SET DEFAULT 'EFECTIVO';

UPDATE public.movimientos_caja
SET
  metodo_pago = COALESCE(metodo_pago, 'EFECTIVO'),
  es_pago_externo = TRUE
WHERE id_venta IS NULL
  AND tipo_movimiento = 'INGRESO';

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'movimientos_caja_metodo_pago_check'
      AND conrelid = 'public.movimientos_caja'::regclass
  ) THEN
    ALTER TABLE public.movimientos_caja
      ADD CONSTRAINT movimientos_caja_metodo_pago_check
      CHECK (
        metodo_pago IS NULL OR
        metodo_pago IN ('EFECTIVO', 'YAPE', 'TRANSFERENCIA')
      );
  END IF;
END;
$do$;

/*
 * Seguro y Crédito institucional no admiten abonos parciales.
 * La venta inicial de Seguro se conserva como pendiente y no crea un cobro.
 */
CREATE OR REPLACE FUNCTION public.fn_validar_pago_institucional()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_venta public.ventas%ROWTYPE;
  v_pagado_previo NUMERIC(12,2) := 0;
  v_saldo_real NUMERIC(12,2) := 0;
BEGIN
  SELECT *
  INTO v_venta
  FROM public.ventas
  WHERE id_venta = NEW.id_venta;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_venta.metodo_pago = 'SEGURO'
     AND UPPER(COALESCE(NEW.metodo_pago, '')) = 'SEGURO'
     AND COALESCE(NEW.observaciones, '') LIKE 'Pago inicial de %'
  THEN
    UPDATE public.ventas
    SET
      a_cuenta = 0,
      saldo = ROUND(COALESCE(total, 0), 2),
      estado_pago = 'PENDIENTE',
      monto_cancelado = 0,
      monto_pendiente = ROUND(COALESCE(total, 0), 2),
      actualizado_en = NOW()
    WHERE id_venta = NEW.id_venta;

    RETURN NULL;
  END IF;

  IF UPPER(COALESCE(NEW.metodo_pago, '')) = 'SEGURO' THEN
    RAISE EXCEPTION
      'Seguro no es un medio de dinero recibido. Selecciona EFECTIVO, YAPE o TRANSFERENCIA.';
  END IF;

  IF v_venta.metodo_pago IN ('SEGURO', 'CREDITO') THEN
    SELECT COALESCE(SUM(pv.monto), 0)
    INTO v_pagado_previo
    FROM public.pagos_venta pv
    WHERE pv.id_venta = NEW.id_venta;

    v_saldo_real := ROUND(
      GREATEST(COALESCE(v_venta.total, 0) - v_pagado_previo, 0),
      2
    );

    IF ABS(ROUND(COALESCE(NEW.monto, 0), 2) - v_saldo_real) >= 0.01 THEN
      RAISE EXCEPTION
        'Seguro y Crédito no admiten pagos parciales. Debes cancelar el saldo completo de S/ %.',
        TO_CHAR(v_saldo_real, 'FM999999990.00');
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validar_pago_institucional
ON public.pagos_venta;

CREATE TRIGGER trg_validar_pago_institucional
BEFORE INSERT ON public.pagos_venta
FOR EACH ROW
EXECUTE FUNCTION public.fn_validar_pago_institucional();

CREATE OR REPLACE FUNCTION public.fn_validar_correccion_pago_institucional()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF UPPER(COALESCE(NEW.metodo_pago, '')) = 'SEGURO' THEN
    RAISE EXCEPTION
      'Seguro no es un medio de dinero recibido. Selecciona EFECTIVO, YAPE o TRANSFERENCIA.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validar_correccion_pago_institucional
ON public.pagos_venta;

CREATE TRIGGER trg_validar_correccion_pago_institucional
BEFORE UPDATE OF metodo_pago ON public.pagos_venta
FOR EACH ROW
EXECUTE FUNCTION public.fn_validar_correccion_pago_institucional();

CREATE OR REPLACE FUNCTION public.registrar_pago_externo_caja(
  p_concepto TEXT,
  p_monto NUMERIC,
  p_metodo_pago TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id_caja BIGINT;
  v_id_movimiento BIGINT;
  v_concepto TEXT;
  v_metodo TEXT;
  v_monto NUMERIC(12,2);
BEGIN
  IF NOT public.fn_caja_usuario_activo() THEN
    RAISE EXCEPTION
      'El usuario autenticado no tiene un perfil activo.';
  END IF;

  IF public.fn_caja_rol_actual() NOT IN ('ADMINISTRADOR', 'VENDEDOR') THEN
    RAISE EXCEPTION
      'El usuario no tiene permiso para operar caja.';
  END IF;

  v_concepto := NULLIF(
    REGEXP_REPLACE(TRIM(COALESCE(p_concepto, '')), '\s+', ' ', 'g'),
    ''
  );

  IF v_concepto IS NULL OR LENGTH(v_concepto) < 4 THEN
    RAISE EXCEPTION 'Escribe el concepto del pago externo.';
  END IF;

  v_monto := ROUND(COALESCE(p_monto, 0), 2);

  IF v_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor que cero.';
  END IF;

  v_metodo := UPPER(TRIM(COALESCE(p_metodo_pago, '')));

  IF v_metodo NOT IN ('EFECTIVO', 'YAPE', 'TRANSFERENCIA') THEN
    RAISE EXCEPTION 'El medio del pago externo no es válido.';
  END IF;

  SELECT c.id_caja
  INTO v_id_caja
  FROM public.cajas c
  WHERE c.estado = 'ABIERTA'
  ORDER BY c.fecha_apertura DESC, c.id_caja DESC
  LIMIT 1
  FOR UPDATE;

  IF v_id_caja IS NULL THEN
    RAISE EXCEPTION 'No existe una caja general abierta.';
  END IF;

  INSERT INTO public.movimientos_caja (
    id_caja,
    id_usuario,
    id_venta,
    tipo_movimiento,
    concepto,
    monto,
    fecha_movimiento,
    metodo_pago,
    es_pago_externo
  )
  VALUES (
    v_id_caja,
    auth.uid(),
    NULL,
    'INGRESO',
    'Pago externo · ' || v_concepto,
    v_monto,
    NOW(),
    v_metodo,
    TRUE
  )
  RETURNING id_movimiento_caja
  INTO v_id_movimiento;

  RETURN JSONB_BUILD_OBJECT(
    'ok', TRUE,
    'id_movimiento', v_id_movimiento,
    'id_caja', v_id_caja,
    'monto', v_monto,
    'metodo_pago', v_metodo
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.listar_movimientos_caja_actual()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id_caja BIGINT;
BEGIN
  IF NOT public.fn_caja_usuario_activo() THEN
    RAISE EXCEPTION
      'El usuario autenticado no tiene un perfil activo.';
  END IF;

  SELECT c.id_caja
  INTO v_id_caja
  FROM public.cajas c
  WHERE c.estado = 'ABIERTA'
  ORDER BY c.fecha_apertura DESC, c.id_caja DESC
  LIMIT 1;

  IF v_id_caja IS NULL THEN
    RETURN '[]'::JSONB;
  END IF;

  RETURN COALESCE(
    (
      SELECT JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id_movimiento', mc.id_movimiento_caja,
          'id_caja', mc.id_caja,
          'id_venta', mc.id_venta,
          'tipo', mc.tipo_movimiento,
          'concepto', mc.concepto,
          'monto', mc.monto,
          'fecha', mc.fecha_movimiento,
          'automatico', mc.id_venta IS NOT NULL,
          'pago_externo',
            COALESCE(mc.es_pago_externo, FALSE) OR
            (mc.id_venta IS NULL AND mc.tipo_movimiento = 'INGRESO'),
          'metodo_pago',
            CASE
              WHEN mc.tipo_movimiento = 'INGRESO'
              THEN COALESCE(mc.metodo_pago, 'EFECTIVO')
              ELSE NULL
            END
        )
        ORDER BY mc.fecha_movimiento DESC
      )
      FROM public.movimientos_caja mc
      WHERE mc.id_caja = v_id_caja
    ),
    '[]'::JSONB
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.obtener_caja_actual()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caja public.cajas%ROWTYPE;
  v_usuario TEXT;
  v_cantidad_ventas BIGINT := 0;
  v_total_vendido NUMERIC(12,2) := 0;
  v_total_pagos_ventas NUMERIC(12,2) := 0;
  v_total_cobrado NUMERIC(12,2) := 0;
  v_saldo_pendiente NUMERIC(12,2) := 0;
  v_efectivo_ventas NUMERIC(12,2) := 0;
  v_yape_ventas NUMERIC(12,2) := 0;
  v_transferencia_ventas NUMERIC(12,2) := 0;
  v_seguro_historico NUMERIC(12,2) := 0;
  v_efectivo NUMERIC(12,2) := 0;
  v_yape NUMERIC(12,2) := 0;
  v_transferencia NUMERIC(12,2) := 0;
  v_pagos_externos NUMERIC(12,2) := 0;
  v_externo_efectivo NUMERIC(12,2) := 0;
  v_externo_yape NUMERIC(12,2) := 0;
  v_externo_transferencia NUMERIC(12,2) := 0;
  v_egresos_manuales NUMERIC(12,2) := 0;
  v_efectivo_esperado NUMERIC(12,2) := 0;
  v_seguro_pendiente NUMERIC(12,2) := 0;
  v_seguros_cobrados NUMERIC(12,2) := 0;
  v_credito_ds NUMERIC(12,2) := 0;
  v_credito_deyfor NUMERIC(12,2) := 0;
  v_creditos_cobrados NUMERIC(12,2) := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  SELECT c.*
  INTO v_caja
  FROM public.cajas c
  WHERE c.estado = 'ABIERTA'
  ORDER BY c.fecha_apertura DESC, c.id_caja DESC
  LIMIT 1;

  IF v_caja.id_caja IS NULL THEN
    RETURN JSONB_BUILD_OBJECT(
      'abierta', FALSE,
      'id_caja', NULL,
      'id_usuario', NULL,
      'usuario', 'Caja general',
      'fecha_apertura', NULL,
      'monto_apertura', 0,
      'estado', NULL,
      'resumen', JSONB_BUILD_OBJECT(
        'cantidad_ventas', 0,
        'total_vendido', 0,
        'total_cobrado', 0,
        'saldo_pendiente', 0,
        'efectivo', 0,
        'yape', 0,
        'transferencia', 0,
        'seguro', 0,
        'seguro_pendiente', 0,
        'seguros_cobrados_hoy', 0,
        'pagos_externos', 0,
        'pagos_externos_efectivo', 0,
        'pagos_externos_yape', 0,
        'pagos_externos_transferencia', 0,
        'ingresos_manuales', 0,
        'egresos_manuales', 0,
        'efectivo_esperado', 0,
        'yape_esperado', 0,
        'credito_ds_generado', 0,
        'credito_deyfor_generado', 0,
        'credito_generado_total', 0,
        'creditos_cobrados_hoy', 0
      )
    );
  END IF;

  SELECT TRIM(CONCAT_WS(' ', u.nombres, u.apellidos))
  INTO v_usuario
  FROM public.usuarios u
  WHERE u.id_usuario = v_caja.id_usuario;

  SELECT
    COUNT(*),
    COALESCE(SUM(v.total), 0),
    COALESCE(SUM(v.saldo), 0),
    COALESCE(SUM(v.saldo) FILTER (WHERE v.metodo_pago = 'SEGURO'), 0),
    COALESCE(SUM(v.total) FILTER (
      WHERE v.metodo_pago = 'CREDITO' AND v.entidad_credito = 'DS'
    ), 0),
    COALESCE(SUM(v.total) FILTER (
      WHERE v.metodo_pago = 'CREDITO' AND v.entidad_credito = 'DEYFOR'
    ), 0)
  INTO
    v_cantidad_ventas,
    v_total_vendido,
    v_saldo_pendiente,
    v_seguro_pendiente,
    v_credito_ds,
    v_credito_deyfor
  FROM public.ventas v
  WHERE v.id_caja = v_caja.id_caja
    AND v.estado_venta = 'REGISTRADA';

  SELECT
    COALESCE(SUM(pv.monto), 0),
    COALESCE(SUM(pv.monto) FILTER (WHERE pv.metodo_pago = 'EFECTIVO'), 0),
    COALESCE(SUM(pv.monto) FILTER (WHERE pv.metodo_pago = 'YAPE'), 0),
    COALESCE(SUM(pv.monto) FILTER (WHERE pv.metodo_pago = 'TRANSFERENCIA'), 0),
    COALESCE(SUM(pv.monto) FILTER (WHERE pv.metodo_pago = 'SEGURO'), 0),
    COALESCE(SUM(pv.monto) FILTER (WHERE v.metodo_pago = 'SEGURO'), 0),
    COALESCE(SUM(pv.monto) FILTER (WHERE v.metodo_pago = 'CREDITO'), 0)
  INTO
    v_total_pagos_ventas,
    v_efectivo_ventas,
    v_yape_ventas,
    v_transferencia_ventas,
    v_seguro_historico,
    v_seguros_cobrados,
    v_creditos_cobrados
  FROM public.pagos_venta pv
  INNER JOIN public.ventas v ON v.id_venta = pv.id_venta
  WHERE pv.id_caja = v_caja.id_caja;

  SELECT
    COALESCE(SUM(mc.monto) FILTER (
      WHERE mc.id_venta IS NULL AND mc.tipo_movimiento = 'INGRESO'
    ), 0),
    COALESCE(SUM(mc.monto) FILTER (
      WHERE mc.id_venta IS NULL AND mc.tipo_movimiento = 'INGRESO'
        AND COALESCE(mc.metodo_pago, 'EFECTIVO') = 'EFECTIVO'
    ), 0),
    COALESCE(SUM(mc.monto) FILTER (
      WHERE mc.id_venta IS NULL AND mc.tipo_movimiento = 'INGRESO'
        AND mc.metodo_pago = 'YAPE'
    ), 0),
    COALESCE(SUM(mc.monto) FILTER (
      WHERE mc.id_venta IS NULL AND mc.tipo_movimiento = 'INGRESO'
        AND mc.metodo_pago = 'TRANSFERENCIA'
    ), 0),
    COALESCE(SUM(mc.monto) FILTER (
      WHERE mc.id_venta IS NULL AND mc.tipo_movimiento = 'EGRESO'
    ), 0)
  INTO
    v_pagos_externos,
    v_externo_efectivo,
    v_externo_yape,
    v_externo_transferencia,
    v_egresos_manuales
  FROM public.movimientos_caja mc
  WHERE mc.id_caja = v_caja.id_caja;

  v_efectivo := v_efectivo_ventas + v_externo_efectivo;
  v_yape := v_yape_ventas + v_externo_yape;
  v_transferencia := v_transferencia_ventas + v_externo_transferencia;
  v_total_cobrado := v_total_pagos_ventas + v_pagos_externos;
  v_efectivo_esperado := ROUND(
    COALESCE(v_caja.monto_apertura, 0) + v_efectivo - v_egresos_manuales,
    2
  );

  RETURN JSONB_BUILD_OBJECT(
    'abierta', TRUE,
    'id_caja', v_caja.id_caja,
    'id_usuario', v_caja.id_usuario,
    'usuario', COALESCE(NULLIF(v_usuario, ''), 'Usuario'),
    'fecha_apertura', v_caja.fecha_apertura,
    'monto_apertura', v_caja.monto_apertura,
    'estado', v_caja.estado,
    'resumen', JSONB_BUILD_OBJECT(
      'cantidad_ventas', v_cantidad_ventas,
      'total_vendido', v_total_vendido,
      'total_cobrado', v_total_cobrado,
      'saldo_pendiente', v_saldo_pendiente,
      'efectivo', v_efectivo,
      'yape', v_yape,
      'transferencia', v_transferencia,
      'seguro', v_seguro_historico,
      'seguro_pendiente', v_seguro_pendiente,
      'seguros_cobrados_hoy', v_seguros_cobrados,
      'pagos_externos', v_pagos_externos,
      'pagos_externos_efectivo', v_externo_efectivo,
      'pagos_externos_yape', v_externo_yape,
      'pagos_externos_transferencia', v_externo_transferencia,
      'ingresos_manuales', v_pagos_externos,
      'egresos_manuales', v_egresos_manuales,
      'efectivo_esperado', v_efectivo_esperado,
      'yape_esperado', v_yape,
      'credito_ds_generado', v_credito_ds,
      'credito_deyfor_generado', v_credito_deyfor,
      'credito_generado_total', v_credito_ds + v_credito_deyfor,
      'creditos_cobrados_hoy', v_creditos_cobrados
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.cerrar_caja_automatico(
  p_observaciones TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caja public.cajas%ROWTYPE;
  v_efectivo NUMERIC(12,2) := 0;
  v_yape NUMERIC(12,2) := 0;
  v_egresos NUMERIC(12,2) := 0;
  v_esperado NUMERIC(12,2) := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  IF NOT public.fn_caja_usuario_activo() THEN
    RAISE EXCEPTION
      'El usuario autenticado no tiene un perfil activo.';
  END IF;

  IF public.fn_caja_rol_actual() NOT IN ('ADMINISTRADOR', 'VENDEDOR') THEN
    RAISE EXCEPTION 'El usuario no tiene permiso para operar caja.';
  END IF;

  SELECT c.*
  INTO v_caja
  FROM public.cajas c
  WHERE c.estado = 'ABIERTA'
  ORDER BY c.fecha_apertura DESC, c.id_caja DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe una caja general abierta.';
  END IF;

  SELECT
    COALESCE(SUM(x.monto) FILTER (WHERE x.metodo = 'EFECTIVO'), 0),
    COALESCE(SUM(x.monto) FILTER (WHERE x.metodo = 'YAPE'), 0)
  INTO v_efectivo, v_yape
  FROM (
    SELECT pv.monto, pv.metodo_pago AS metodo
    FROM public.pagos_venta pv
    WHERE pv.id_caja = v_caja.id_caja

    UNION ALL

    SELECT mc.monto, COALESCE(mc.metodo_pago, 'EFECTIVO') AS metodo
    FROM public.movimientos_caja mc
    WHERE mc.id_caja = v_caja.id_caja
      AND mc.id_venta IS NULL
      AND mc.tipo_movimiento = 'INGRESO'
  ) x;

  SELECT COALESCE(SUM(mc.monto), 0)
  INTO v_egresos
  FROM public.movimientos_caja mc
  WHERE mc.id_caja = v_caja.id_caja
    AND mc.id_venta IS NULL
    AND mc.tipo_movimiento = 'EGRESO';

  v_esperado := ROUND(
    COALESCE(v_caja.monto_apertura, 0) + v_efectivo - v_egresos,
    2
  );

  UPDATE public.cajas
  SET
    fecha_cierre = NOW(),
    monto_cierre_real = v_esperado,
    monto_esperado = v_esperado,
    diferencia = 0,
    yape_esperado = ROUND(v_yape, 2),
    yape_confirmado = ROUND(v_yape, 2),
    diferencia_yape = 0,
    observaciones = NULLIF(TRIM(COALESCE(p_observaciones, '')), ''),
    estado = 'CERRADA'
  WHERE id_caja = v_caja.id_caja;

  RETURN JSONB_BUILD_OBJECT(
    'ok', TRUE,
    'modo_cierre', 'AUTOMATICO',
    'id_caja', v_caja.id_caja,
    'monto_esperado', v_esperado,
    'monto_cierre_real', v_esperado,
    'diferencia', 0,
    'yape_esperado', ROUND(v_yape, 2),
    'yape_confirmado', ROUND(v_yape, 2),
    'diferencia_yape', 0
  );
END;
$function$;

-- Compatibilidad: cualquier cliente antiguo también cerrará automáticamente.
CREATE OR REPLACE FUNCTION public.cerrar_caja(
  p_monto_cierre_real NUMERIC,
  p_monto_yape_confirmado NUMERIC,
  p_observaciones TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.cerrar_caja_automatico(p_observaciones);
END;
$function$;

CREATE OR REPLACE FUNCTION public.listar_cierres_caja(
  p_desde DATE DEFAULT NULL,
  p_hasta DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rol TEXT;
  v_desde DATE;
  v_hasta DATE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  SELECT UPPER(TRIM(r.nombre))
  INTO v_rol
  FROM public.usuarios u
  INNER JOIN public.roles r ON r.id_rol = u.id_rol
  WHERE u.id_usuario = auth.uid()
    AND u.activo = TRUE
    AND r.activo = TRUE
  LIMIT 1;

  IF v_rol NOT IN ('ADMINISTRADOR', 'VENDEDOR') THEN
    RAISE EXCEPTION 'El usuario no tiene permiso para consultar caja.';
  END IF;

  v_desde := COALESCE(
    p_desde,
    (NOW() AT TIME ZONE 'America/Lima')::DATE - 30
  );
  v_hasta := COALESCE(
    p_hasta,
    (NOW() AT TIME ZONE 'America/Lima')::DATE
  );

  IF v_desde > v_hasta THEN
    RAISE EXCEPTION
      'La fecha inicial no puede ser posterior a la fecha final.';
  END IF;

  RETURN COALESCE(
    (
      SELECT JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id_caja', c.id_caja,
          'id_usuario', c.id_usuario,
          'usuario', COALESCE(
            NULLIF(TRIM(CONCAT_WS(' ', u.nombres, u.apellidos)), ''),
            u.email,
            'Usuario'
          ),
          'fecha_apertura', c.fecha_apertura,
          'fecha_cierre', c.fecha_cierre,
          'monto_apertura', c.monto_apertura,
          'monto_esperado', COALESCE(
            c.monto_esperado,
            COALESCE(c.monto_apertura, 0) +
              COALESCE(p.efectivo, 0) + COALESCE(m.externo_efectivo, 0) -
              COALESCE(m.egresos, 0)
          ),
          'monto_cierre_real', c.monto_cierre_real,
          'diferencia', c.diferencia,
          'yape_esperado', COALESCE(
            c.yape_esperado,
            COALESCE(p.yape, 0) + COALESCE(m.externo_yape, 0)
          ),
          'yape_confirmado', c.yape_confirmado,
          'diferencia_yape', c.diferencia_yape,
          'estado', c.estado,
          'observaciones', COALESCE(c.observaciones, ''),
          'cantidad_ventas', COALESCE(v.cantidad_ventas, 0),
          'total_vendido', COALESCE(v.total_vendido, 0),
          'total_cobrado', COALESCE(p.total_pagos, 0) + COALESCE(m.externos, 0),
          'saldo_pendiente', COALESCE(v.saldo_pendiente, 0),
          'efectivo', COALESCE(p.efectivo, 0) + COALESCE(m.externo_efectivo, 0),
          'yape', COALESCE(p.yape, 0) + COALESCE(m.externo_yape, 0),
          'transferencia',
            COALESCE(p.transferencia, 0) + COALESCE(m.externo_transferencia, 0),
          'seguro', COALESCE(p.seguro_historico, 0),
          'seguro_pendiente', COALESCE(v.seguro_pendiente, 0),
          'seguros_cobrados_hoy', COALESCE(p.seguros_cobrados, 0),
          'pagos_externos', COALESCE(m.externos, 0),
          'pagos_externos_efectivo', COALESCE(m.externo_efectivo, 0),
          'pagos_externos_yape', COALESCE(m.externo_yape, 0),
          'pagos_externos_transferencia', COALESCE(m.externo_transferencia, 0),
          'ingresos_manuales', COALESCE(m.externos, 0),
          'egresos_manuales', COALESCE(m.egresos, 0)
        )
        ORDER BY c.fecha_apertura DESC
      )
      FROM public.cajas c
      INNER JOIN public.usuarios u ON u.id_usuario = c.id_usuario
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS cantidad_ventas,
          COALESCE(SUM(vt.total), 0) AS total_vendido,
          COALESCE(SUM(vt.saldo), 0) AS saldo_pendiente,
          COALESCE(SUM(vt.saldo) FILTER (
            WHERE vt.metodo_pago = 'SEGURO'
          ), 0) AS seguro_pendiente
        FROM public.ventas vt
        WHERE vt.id_caja = c.id_caja
          AND vt.estado_venta = 'REGISTRADA'
      ) v ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(pv.monto), 0) AS total_pagos,
          COALESCE(SUM(pv.monto) FILTER (
            WHERE pv.metodo_pago = 'EFECTIVO'
          ), 0) AS efectivo,
          COALESCE(SUM(pv.monto) FILTER (
            WHERE pv.metodo_pago = 'YAPE'
          ), 0) AS yape,
          COALESCE(SUM(pv.monto) FILTER (
            WHERE pv.metodo_pago = 'TRANSFERENCIA'
          ), 0) AS transferencia,
          COALESCE(SUM(pv.monto) FILTER (
            WHERE pv.metodo_pago = 'SEGURO'
          ), 0) AS seguro_historico,
          COALESCE(SUM(pv.monto) FILTER (
            WHERE vp.metodo_pago = 'SEGURO'
          ), 0) AS seguros_cobrados
        FROM public.pagos_venta pv
        INNER JOIN public.ventas vp ON vp.id_venta = pv.id_venta
        WHERE pv.id_caja = c.id_caja
      ) p ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(mc.monto) FILTER (
            WHERE mc.id_venta IS NULL AND mc.tipo_movimiento = 'INGRESO'
          ), 0) AS externos,
          COALESCE(SUM(mc.monto) FILTER (
            WHERE mc.id_venta IS NULL AND mc.tipo_movimiento = 'INGRESO'
              AND COALESCE(mc.metodo_pago, 'EFECTIVO') = 'EFECTIVO'
          ), 0) AS externo_efectivo,
          COALESCE(SUM(mc.monto) FILTER (
            WHERE mc.id_venta IS NULL AND mc.tipo_movimiento = 'INGRESO'
              AND mc.metodo_pago = 'YAPE'
          ), 0) AS externo_yape,
          COALESCE(SUM(mc.monto) FILTER (
            WHERE mc.id_venta IS NULL AND mc.tipo_movimiento = 'INGRESO'
              AND mc.metodo_pago = 'TRANSFERENCIA'
          ), 0) AS externo_transferencia,
          COALESCE(SUM(mc.monto) FILTER (
            WHERE mc.id_venta IS NULL AND mc.tipo_movimiento = 'EGRESO'
          ), 0) AS egresos
        FROM public.movimientos_caja mc
        WHERE mc.id_caja = c.id_caja
      ) m ON TRUE
      WHERE DATE(c.fecha_apertura AT TIME ZONE 'America/Lima')
        BETWEEN v_desde AND v_hasta
    ),
    '[]'::JSONB
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_pago_externo_caja(TEXT, NUMERIC, TEXT)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_pago_externo_caja(TEXT, NUMERIC, TEXT)
TO authenticated;

REVOKE ALL ON FUNCTION public.cerrar_caja_automatico(TEXT)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cerrar_caja_automatico(TEXT)
TO authenticated;

COMMIT;
