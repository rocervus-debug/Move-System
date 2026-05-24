-- ============================================================================
-- VELUM · SCHEMA UNIFICADO PAGOS + STOREFRONT (v2)
-- Supabase Postgres · Mayo 2026
-- ============================================================================
-- v2 cambia sobre v1:
--   • storefront_packages → DEPRECADO. Ahora storefront_listings (FK a packages)
--   • storefront_transactions → DEPRECADO. Se fusiona con pagos unificado
--   • pagos AGREGA: package_id NOT NULL, discount fields, source enum, legacy flag
--   • Sin pagos parciales (decisión bloqueada con Roy 22/May/2026)
--   • Migración de históricos: flag is_legacy=true
--
-- Aplicación recomendada:
--   1. Backup completo de DB (Supabase → Database → Backups)
--   2. Aplicar en orden las secciones (1 → 10)
--   3. Setear fecha cutover en la query del paso 8 (UPDATE legacy)
--   4. Probar con cuenta de staging antes de producción
-- ============================================================================


-- ============================================================================
-- 1. EXTENSIÓN A LA TABLA packages (catálogo del gym)
-- ============================================================================
-- Asume que ya existe la tabla packages (o planes/paquetes). Si tu tabla
-- se llama distinto, ajusta el nombre.
-- Estos campos son opcionales pero útiles para permitir presentación pública.

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS is_active            BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS internal_only        BOOLEAN DEFAULT false,
  -- internal_only = TRUE → solo admin puede vender, NUNCA visible en storefront
  ADD COLUMN IF NOT EXISTS allow_discount       BOOLEAN DEFAULT true,
  -- allow_discount = FALSE → bloquea descuentos al registrar pago
  ADD COLUMN IF NOT EXISTS max_discount_pct     NUMERIC(5,2) DEFAULT 100.00;
  -- max_discount_pct = 50 → descuento máximo 50% del listado

COMMENT ON COLUMN packages.internal_only IS 'TRUE = paquete privado, no aparece en Storefront aunque storefront_listing exista';
COMMENT ON COLUMN packages.allow_discount IS 'FALSE = no se permite descuento al registrar pago en admin';


-- ============================================================================
-- 2. STOREFRONT CONFIG (sin cambios respecto a v1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS gym_storefront (
  gym_id              UUID PRIMARY KEY REFERENCES gyms(id) ON DELETE CASCADE,
  slug                TEXT UNIQUE NOT NULL CHECK (slug ~* '^[a-z0-9-]{3,60}$'),
  is_enabled          BOOLEAN DEFAULT false,
  mode                TEXT DEFAULT 'public' CHECK (mode IN ('public', 'curated', 'private')),

  hero_image_url      TEXT,
  hero_video_url      TEXT,
  description         TEXT,
  highlights          JSONB DEFAULT '[]'::jsonb,
  about_html          TEXT,
  primary_color       TEXT DEFAULT '#00D4FF',
  show_velum_badge    BOOLEAN DEFAULT true,

  google_rating       NUMERIC(2,1),
  google_review_count INTEGER DEFAULT 0,
  social_instagram    TEXT,
  social_facebook     TEXT,
  social_whatsapp     TEXT,
  social_tiktok       TEXT,

  trial_class_enabled BOOLEAN DEFAULT true,
  free_first_month    BOOLEAN DEFAULT false,

  commission_pct      NUMERIC(5,2) DEFAULT 2.00,
  commission_cap_mxn  INTEGER DEFAULT 5000,
  trial_period_ends_at TIMESTAMPTZ,

  stripe_account_id   TEXT,
  stripe_onboarded    BOOLEAN DEFAULT false,

  whatsapp_phone_id   TEXT,
  whatsapp_template_credentials TEXT DEFAULT 'velum_welcome_magic_v1',
  whatsapp_template_recovery TEXT DEFAULT 'velum_cart_recovery_v1',

  meta_pixel_id       TEXT,
  google_tag_id       TEXT,

  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);


-- ============================================================================
-- 3. STOREFRONT LISTINGS · Overlay público sobre packages del admin
-- ============================================================================
-- Esto reemplaza a storefront_packages de v1.
-- Es la capa de presentación: qué paquetes del admin son públicos + cómo se ven.
-- Source of truth de precios/info: tabla packages.
-- ============================================================================

CREATE TABLE IF NOT EXISTS storefront_listings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id              UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  package_id          UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,

  is_public           BOOLEAN DEFAULT false,
  sort_order          INTEGER DEFAULT 0,
  is_featured         BOOLEAN DEFAULT false,
  badge_text          TEXT,  -- "Más elegido", "Mejor valor"

  -- Override opcional de presentación pública
  public_name         TEXT,  -- si NULL, usa packages.name
  public_description  TEXT,  -- si NULL, usa packages.description
  features_list       JSONB DEFAULT '[]'::jsonb,
  hero_image_url      TEXT,

  -- Stripe Price ID (creado dinámicamente cuando se publica)
  stripe_price_id     TEXT,
  stripe_product_id   TEXT,

  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_listings_gym_package ON storefront_listings(gym_id, package_id);
CREATE INDEX idx_listings_public ON storefront_listings(gym_id, is_public) WHERE is_public = true;

COMMENT ON TABLE storefront_listings IS 'Capa de presentación pública: qué paquetes del admin se exponen en Storefront y cómo';


-- ============================================================================
-- 4. PAGOS · Tabla unificada (admin + storefront + app + recovery)
-- ============================================================================
-- Esta es la tabla CORE. Reemplaza storefront_transactions de v1.
-- TODO pago tiene que estar aquí, sin importar origen.
-- Constraint crítico: package_id obligatorio (excepto legacy).
-- ============================================================================

CREATE TABLE IF NOT EXISTS pagos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id              UUID NOT NULL REFERENCES gyms(id) ON DELETE RESTRICT,
  cliente_id          UUID REFERENCES clientes(id) ON DELETE SET NULL,
  package_id          UUID REFERENCES packages(id) ON DELETE RESTRICT,

  -- ========== PRECIO (sin parciales, decisión Roy 22/May/2026) ==========
  list_price_mxn      INTEGER NOT NULL CHECK (list_price_mxn >= 0),
  applied_price_mxn   INTEGER NOT NULL CHECK (applied_price_mxn >= 0),
  discount_mxn        INTEGER GENERATED ALWAYS AS (list_price_mxn - applied_price_mxn) STORED,

  -- ========== DESCUENTO (lista predefinida + nota opcional) ==========
  discount_type       TEXT CHECK (discount_type IN (
    'efectivo',       -- Pago en efectivo con descuento
    'lealtad',        -- Cliente >6 meses
    'referido',       -- Trajo a alguien nuevo
    'estudiante',     -- Plan con credencial
    'familiar',       -- Pareja/hermano de miembro activo
    'empleado',       -- Trabajador de empresa convenio
    'cortesia',       -- Comp / regalo / influencer
    'temporal',       -- Promo de fecha
    'otro'            -- Edge cases
  ) OR discount_type IS NULL),
  discount_note       TEXT,  -- opcional, free-text

  -- ========== PAYMENT METHOD ==========
  payment_method      TEXT NOT NULL CHECK (payment_method IN (
    'efectivo', 'transferencia', 'tarjeta_admin', 'stripe', 'mercadopago', 'otro'
  )),

  -- ========== ORIGIN ==========
  source              TEXT NOT NULL DEFAULT 'admin' CHECK (source IN (
    'admin',          -- Registrado manual por gym
    'storefront',     -- Compra pública /g/{slug}
    'app',            -- Compra desde app del atleta
    'recovery',       -- Compra vía recovery de cart abandonado
    'qr',             -- Compra vía QR code físico en el box
    'auto_renewal'    -- Renovación automática
  )),
  registered_by_user_id UUID REFERENCES auth.users(id),  -- quién registró (admin) o NULL si auto

  -- ========== STOREFRONT-SPECIFIC (NULL si source != storefront/recovery/qr) ==========
  cart_id             UUID REFERENCES storefront_carts(id) ON DELETE SET NULL,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_charge_id    TEXT,
  stripe_customer_id  TEXT,
  stripe_fee_mxn      INTEGER DEFAULT 0,
  velum_commission_mxn INTEGER DEFAULT 0,
  net_to_gym_mxn      INTEGER,

  -- ========== STATUS ==========
  status              TEXT NOT NULL DEFAULT 'completed' CHECK (status IN (
    'pending', 'completed', 'refunded', 'partially_refunded', 'disputed', 'failed'
  )),
  refunded_at         TIMESTAMPTZ,
  refund_amount_mxn   INTEGER,
  refund_reason       TEXT,

  -- ========== LEGACY MIGRATION FLAG ==========
  is_legacy           BOOLEAN DEFAULT false,
  -- TRUE = pago anterior al cutover sin package_id obligatorio
  -- FALSE = pago nuevo con constraint aplicado

  -- ========== TIMESTAMPS ==========
  paid_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),

  -- ========== CONSTRAINTS BLOQUEADOS ==========
  CONSTRAINT pago_requires_package CHECK (
    is_legacy = true OR package_id IS NOT NULL
  ),
  CONSTRAINT discount_requires_reason CHECK (
    applied_price_mxn = list_price_mxn  -- precio completo, sin descuento → OK
    OR (applied_price_mxn < list_price_mxn AND discount_type IS NOT NULL)  -- descuento con razón → OK
    OR is_legacy = true  -- legacy bypass
  ),
  CONSTRAINT applied_lte_list CHECK (
    applied_price_mxn <= list_price_mxn  -- nunca se cobra más del precio listado
    OR is_legacy = true
  )
);

CREATE INDEX idx_pagos_gym_date ON pagos(gym_id, paid_at DESC) WHERE is_legacy = false;
CREATE INDEX idx_pagos_cliente ON pagos(cliente_id, paid_at DESC);
CREATE INDEX idx_pagos_package ON pagos(package_id, paid_at DESC);
CREATE INDEX idx_pagos_source ON pagos(source, paid_at DESC);
CREATE INDEX idx_pagos_stripe_pi ON pagos(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX idx_pagos_legacy ON pagos(is_legacy);

COMMENT ON TABLE pagos IS 'Tabla unificada de pagos. CADA venta (admin manual, storefront, app, recovery) vive aquí';
COMMENT ON COLUMN pagos.package_id IS 'OBLIGATORIO desde cutover. Legacy=true permite NULL retroactivo';
COMMENT ON COLUMN pagos.is_legacy IS 'TRUE = pago pre-cutover, exento de constraints estrictos';


-- ============================================================================
-- 5. STOREFRONT CARTS (sin cambios respecto a v1)
-- ============================================================================
CREATE TABLE IF NOT EXISTS storefront_carts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id              UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  session_id          TEXT NOT NULL,
  listing_id          UUID REFERENCES storefront_listings(id) ON DELETE SET NULL,
  package_id          UUID REFERENCES packages(id) ON DELETE SET NULL,

  visitor_email       TEXT,
  visitor_phone       TEXT,
  visitor_name        TEXT,

  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active', 'abandoned', 'recovered', 'completed', 'expired'
  )),

  abandoned_at        TIMESTAMPTZ,
  recovery_attempted_at TIMESTAMPTZ,
  recovered_at        TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days'),

  recovery_message_sent BOOLEAN DEFAULT false,
  recovery_discount_offered INTEGER DEFAULT 0,

  initiated_from_ia   BOOLEAN DEFAULT false,
  ia_conversation_id  UUID,

  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_carts_status_abandoned ON storefront_carts(status, abandoned_at)
  WHERE status = 'abandoned' AND recovery_message_sent = false;
CREATE INDEX idx_carts_gym ON storefront_carts(gym_id, created_at DESC);


-- ============================================================================
-- 6. STOREFRONT VISITS + IA CONVERSATIONS + COMMISSION PAYOUTS
-- (sin cambios sustanciales respecto a v1, pero ia_conversations apunta a pagos)
-- ============================================================================

CREATE TABLE IF NOT EXISTS storefront_visits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id              UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  session_id          TEXT NOT NULL,
  visitor_ip          INET,
  user_agent          TEXT,
  referrer            TEXT,
  utm_source          TEXT,
  utm_medium          TEXT,
  utm_campaign        TEXT,
  utm_content         TEXT,
  utm_term            TEXT,
  device_type         TEXT,
  country             TEXT,
  city                TEXT,
  visited_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_visits_gym_date ON storefront_visits(gym_id, visited_at DESC);


CREATE TABLE IF NOT EXISTS ia_conversations_public (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id              UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  session_id          TEXT NOT NULL,
  visitor_email       TEXT,
  visitor_phone       TEXT,
  visitor_name        TEXT,
  messages            JSONB DEFAULT '[]'::jsonb,
  listing_recommended UUID REFERENCES storefront_listings(id) ON DELETE SET NULL,
  led_to_purchase     BOOLEAN DEFAULT false,
  cart_id             UUID REFERENCES storefront_carts(id) ON DELETE SET NULL,
  pago_id             UUID REFERENCES pagos(id) ON DELETE SET NULL,
  total_input_tokens  INTEGER DEFAULT 0,
  total_cached_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  estimated_cost_usd  NUMERIC(10,4) DEFAULT 0,
  user_rated_helpful  BOOLEAN,
  created_at          TIMESTAMPTZ DEFAULT now(),
  last_message_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ia_conv_gym ON ia_conversations_public(gym_id, created_at DESC);


CREATE TABLE IF NOT EXISTS commission_payouts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id              UUID NOT NULL REFERENCES gyms(id) ON DELETE RESTRICT,
  period_start        DATE NOT NULL,
  period_end          DATE NOT NULL,
  total_gross_mxn     INTEGER NOT NULL DEFAULT 0,
  total_commission_mxn INTEGER NOT NULL DEFAULT 0,
  transaction_count   INTEGER NOT NULL DEFAULT 0,
  capped_at_mxn       INTEGER,
  status              TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'invoiced', 'paid', 'failed', 'waived'
  )),
  stripe_invoice_id   TEXT,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_payouts_gym_period_unique ON commission_payouts(gym_id, period_start);


-- ============================================================================
-- 7. RLS POLICIES (críticas — aislamiento entre gyms)
-- ============================================================================

ALTER TABLE gym_storefront           ENABLE ROW LEVEL SECURITY;
ALTER TABLE storefront_listings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE storefront_visits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE storefront_carts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_conversations_public  ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_payouts       ENABLE ROW LEVEL SECURITY;


-- gym_storefront
CREATE POLICY "Public read enabled storefronts" ON gym_storefront
  FOR SELECT TO anon, authenticated
  USING (is_enabled = true);

CREATE POLICY "Owners manage own storefront" ON gym_storefront
  FOR ALL TO authenticated
  USING (gym_id IN (SELECT gym_id FROM gym_owners WHERE user_id = auth.uid()))
  WITH CHECK (gym_id IN (SELECT gym_id FROM gym_owners WHERE user_id = auth.uid()));


-- storefront_listings
CREATE POLICY "Public read public listings of enabled gyms" ON storefront_listings
  FOR SELECT TO anon, authenticated
  USING (
    is_public = true
    AND gym_id IN (SELECT gym_id FROM gym_storefront WHERE is_enabled = true)
    AND package_id IN (SELECT id FROM packages WHERE is_active = true AND internal_only = false)
  );

CREATE POLICY "Owners manage own listings" ON storefront_listings
  FOR ALL TO authenticated
  USING (gym_id IN (SELECT gym_id FROM gym_owners WHERE user_id = auth.uid()))
  WITH CHECK (gym_id IN (SELECT gym_id FROM gym_owners WHERE user_id = auth.uid()));


-- pagos (CRÍTICO — financiero)
CREATE POLICY "Owners read own pagos" ON pagos
  FOR SELECT TO authenticated
  USING (gym_id IN (SELECT gym_id FROM gym_owners WHERE user_id = auth.uid()));

CREATE POLICY "Owners insert pagos for own gym" ON pagos
  FOR INSERT TO authenticated
  WITH CHECK (gym_id IN (SELECT gym_id FROM gym_owners WHERE user_id = auth.uid()));

CREATE POLICY "Owners update own pagos (limited fields)" ON pagos
  FOR UPDATE TO authenticated
  USING (gym_id IN (SELECT gym_id FROM gym_owners WHERE user_id = auth.uid()));
-- Nota: en práctica, los pagos no se editan retroactivamente. Solo refunds vía service role.

CREATE POLICY "Cliente reads own pagos" ON pagos
  FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT id FROM clientes WHERE user_id = auth.uid()));

-- Service role bypassea todo (Stripe webhook, edge functions)


-- otros (carts, visits, ia, payouts)
CREATE POLICY "Owners read own carts" ON storefront_carts
  FOR SELECT TO authenticated
  USING (gym_id IN (SELECT gym_id FROM gym_owners WHERE user_id = auth.uid()));

CREATE POLICY "Owners read own visits" ON storefront_visits
  FOR SELECT TO authenticated
  USING (gym_id IN (SELECT gym_id FROM gym_owners WHERE user_id = auth.uid()));

CREATE POLICY "Owners read own ia conversations" ON ia_conversations_public
  FOR SELECT TO authenticated
  USING (gym_id IN (SELECT gym_id FROM gym_owners WHERE user_id = auth.uid()));

CREATE POLICY "Owners read own payouts" ON commission_payouts
  FOR SELECT TO authenticated
  USING (gym_id IN (SELECT gym_id FROM gym_owners WHERE user_id = auth.uid()));


-- ============================================================================
-- 8. MIGRACIÓN DE PAGOS HISTÓRICOS (ejecutar UNA SOLA VEZ en cutover)
-- ============================================================================
-- IMPORTANTE: Esto se corre ANTES de aplicar los constraints estrictos de la
-- sección 4. Asume que ya existe la tabla pagos con datos previos.
--
-- Si tu tabla anterior se llama distinto (ej. cobros, transacciones, ventas),
-- ajusta el nombre.
-- ============================================================================

-- 8a. Marcar TODOS los pagos existentes como legacy
UPDATE pagos
SET is_legacy = true
WHERE created_at < CURRENT_DATE;  -- ajusta la fecha del cutover

-- 8b. Validar que se marcaron correctamente
SELECT
  COUNT(*) FILTER (WHERE is_legacy = true) AS legacy_count,
  COUNT(*) FILTER (WHERE is_legacy = false) AS new_count,
  COUNT(*) FILTER (WHERE package_id IS NULL AND is_legacy = false) AS broken_count
FROM pagos;
-- broken_count debe ser 0. Si > 0, hay datos inconsistentes que arreglar.


-- ============================================================================
-- 9. FUNCIONES Y TRIGGERS
-- ============================================================================

-- Calcular comisión VELUM (idéntica a v1)
CREATE OR REPLACE FUNCTION calc_velum_commission(p_gym_id UUID, p_gross_amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_pct NUMERIC;
  v_cap INTEGER;
  v_trial_ends TIMESTAMPTZ;
  v_month_total INTEGER;
  v_commission INTEGER;
BEGIN
  SELECT commission_pct, commission_cap_mxn, trial_period_ends_at
    INTO v_pct, v_cap, v_trial_ends
  FROM gym_storefront
  WHERE gym_id = p_gym_id;

  IF v_trial_ends IS NOT NULL AND v_trial_ends > now() THEN
    RETURN 0;
  END IF;

  v_commission := FLOOR(p_gross_amount * v_pct / 100);

  SELECT COALESCE(SUM(velum_commission_mxn), 0) INTO v_month_total
  FROM pagos
  WHERE gym_id = p_gym_id
    AND status = 'completed'
    AND source IN ('storefront', 'recovery', 'qr')
    AND date_trunc('month', paid_at) = date_trunc('month', now());

  IF v_month_total + v_commission > v_cap THEN
    v_commission := GREATEST(0, v_cap - v_month_total);
  END IF;

  RETURN v_commission;
END;
$$;


-- Snapshot automático del precio del paquete al insertar pago
CREATE OR REPLACE FUNCTION snapshot_package_price()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Si list_price_mxn no fue provisto y hay package_id, lo tomamos del catálogo
  IF NEW.list_price_mxn IS NULL AND NEW.package_id IS NOT NULL THEN
    SELECT price_mxn INTO NEW.list_price_mxn
    FROM packages WHERE id = NEW.package_id;
  END IF;

  -- Si applied_price_mxn no fue provisto, asume precio completo
  IF NEW.applied_price_mxn IS NULL THEN
    NEW.applied_price_mxn := NEW.list_price_mxn;
  END IF;

  -- Si source = storefront, validar net_to_gym
  IF NEW.source IN ('storefront', 'recovery', 'qr') AND NEW.net_to_gym_mxn IS NULL THEN
    NEW.net_to_gym_mxn := NEW.applied_price_mxn - COALESCE(NEW.stripe_fee_mxn, 0) - COALESCE(NEW.velum_commission_mxn, 0);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_snapshot_price BEFORE INSERT ON pagos
  FOR EACH ROW EXECUTE FUNCTION snapshot_package_price();


-- Validar que el descuento respete max_discount_pct del package
CREATE OR REPLACE FUNCTION validate_max_discount()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_max_pct NUMERIC;
  v_actual_pct NUMERIC;
  v_allow BOOLEAN;
BEGIN
  IF NEW.is_legacy = true OR NEW.applied_price_mxn = NEW.list_price_mxn THEN
    RETURN NEW;
  END IF;

  SELECT allow_discount, max_discount_pct
    INTO v_allow, v_max_pct
  FROM packages WHERE id = NEW.package_id;

  IF v_allow = false AND NEW.applied_price_mxn < NEW.list_price_mxn THEN
    RAISE EXCEPTION 'El paquete % no permite descuentos', NEW.package_id;
  END IF;

  v_actual_pct := ((NEW.list_price_mxn - NEW.applied_price_mxn)::NUMERIC / NEW.list_price_mxn) * 100;

  IF v_actual_pct > v_max_pct THEN
    RAISE EXCEPTION 'El descuento de %% excede el máximo permitido de %%', v_actual_pct, v_max_pct;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_discount BEFORE INSERT OR UPDATE ON pagos
  FOR EACH ROW EXECUTE FUNCTION validate_max_discount();


-- Auto-update updated_at
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER set_updated_at_storefront BEFORE UPDATE ON gym_storefront
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at_listings BEFORE UPDATE ON storefront_listings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at_pagos BEFORE UPDATE ON pagos
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- Auto-marcar carritos abandonados después de 30 min
CREATE OR REPLACE FUNCTION mark_abandoned_carts()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE storefront_carts
  SET status = 'abandoned', abandoned_at = now(), updated_at = now()
  WHERE status = 'active'
    AND created_at < now() - INTERVAL '30 minutes'
    AND visitor_email IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


-- ============================================================================
-- 10. VIEWS · Para reportes del dashboard
-- ============================================================================

-- Revenue por paquete (solo desde cutover, no legacy)
CREATE OR REPLACE VIEW v_revenue_por_paquete AS
SELECT
  p.gym_id,
  p.package_id,
  pkg.name AS package_name,
  COUNT(*) AS ventas,
  SUM(p.list_price_mxn) AS revenue_listado,
  SUM(p.applied_price_mxn) AS revenue_real,
  SUM(p.discount_mxn) AS descuentos_total,
  ROUND(AVG(p.applied_price_mxn::NUMERIC / NULLIF(p.list_price_mxn, 0)) * 100, 1) AS pct_promedio_cobrado,
  COUNT(*) FILTER (WHERE p.source = 'storefront') AS ventas_storefront,
  COUNT(*) FILTER (WHERE p.source = 'admin') AS ventas_admin
FROM pagos p
JOIN packages pkg ON pkg.id = p.package_id
WHERE p.is_legacy = false AND p.status = 'completed'
GROUP BY p.gym_id, p.package_id, pkg.name;


-- Descuentos por tipo de razón
CREATE OR REPLACE VIEW v_descuentos_por_razon AS
SELECT
  gym_id,
  discount_type,
  COUNT(*) AS aplicados,
  SUM(discount_mxn) AS total_descontado,
  ROUND(AVG(discount_mxn), 0) AS promedio_descuento
FROM pagos
WHERE is_legacy = false
  AND discount_type IS NOT NULL
  AND status = 'completed'
GROUP BY gym_id, discount_type
ORDER BY total_descontado DESC;


-- Funnel storefront (igual a v1 pero apuntando a pagos)
CREATE OR REPLACE VIEW v_storefront_funnel AS
SELECT
  v.gym_id,
  DATE(v.visited_at) AS day,
  COUNT(DISTINCT v.session_id) AS visits,
  COUNT(DISTINCT CASE WHEN c.id IS NOT NULL THEN c.session_id END) AS started_checkout,
  COUNT(DISTINCT CASE WHEN c.status = 'abandoned' THEN c.session_id END) AS abandoned,
  COUNT(DISTINCT CASE WHEN c.status = 'recovered' THEN c.session_id END) AS recovered,
  COUNT(DISTINCT CASE WHEN c.status = 'completed' THEN c.session_id END) AS completed,
  COALESCE(SUM(p.list_price_mxn) FILTER (WHERE p.status = 'completed'), 0) AS gross_revenue_mxn,
  COALESCE(SUM(p.velum_commission_mxn) FILTER (WHERE p.status = 'completed'), 0) AS velum_commission_mxn,
  COALESCE(SUM(p.net_to_gym_mxn) FILTER (WHERE p.status = 'completed'), 0) AS net_revenue_mxn
FROM storefront_visits v
LEFT JOIN storefront_carts c ON v.session_id = c.session_id AND v.gym_id = c.gym_id
LEFT JOIN pagos p ON c.id = p.cart_id AND p.status = 'completed'
GROUP BY v.gym_id, DATE(v.visited_at);


-- IA conversion rate
CREATE OR REPLACE VIEW v_ia_conversion AS
SELECT
  gym_id,
  DATE(created_at) AS day,
  COUNT(*) AS total_conversations,
  COUNT(*) FILTER (WHERE led_to_purchase = true) AS conversions,
  ROUND(100.0 * COUNT(*) FILTER (WHERE led_to_purchase = true) / NULLIF(COUNT(*), 0), 2) AS conversion_pct,
  SUM(estimated_cost_usd) AS ia_cost_usd
FROM ia_conversations_public
GROUP BY gym_id, DATE(created_at);


-- ARPU + retención por cohorte (paquete inicial)
CREATE OR REPLACE VIEW v_cohorte_por_paquete_inicial AS
WITH primer_pago AS (
  SELECT DISTINCT ON (cliente_id)
    cliente_id, gym_id, package_id, paid_at AS first_paid_at
  FROM pagos
  WHERE is_legacy = false AND status = 'completed'
  ORDER BY cliente_id, paid_at ASC
)
SELECT
  pp.gym_id,
  pp.package_id,
  pkg.name AS paquete_inicial,
  COUNT(DISTINCT pp.cliente_id) AS clientes_cohorte,
  COUNT(DISTINCT p.id) AS total_renovaciones,
  ROUND(AVG(p.applied_price_mxn), 0) AS arpu,
  ROUND(EXTRACT(EPOCH FROM AVG(p.paid_at - pp.first_paid_at)) / 86400, 0) AS dias_retencion_promedio
FROM primer_pago pp
JOIN packages pkg ON pkg.id = pp.package_id
LEFT JOIN pagos p ON p.cliente_id = pp.cliente_id AND p.is_legacy = false AND p.status = 'completed'
GROUP BY pp.gym_id, pp.package_id, pkg.name;


-- ============================================================================
-- 11. SEED DATA (DEMO) · Solo development
-- ============================================================================
-- Descomenta solo en staging.
--
-- INSERT INTO gym_storefront (gym_id, slug, is_enabled, ...) VALUES (...);
-- INSERT INTO storefront_listings (gym_id, package_id, is_public, sort_order, ...) VALUES (...);
--
-- Asegúrate de que el package_id existe en la tabla packages antes de listing.


-- ============================================================================
-- FIN DEL SCHEMA v2
-- ============================================================================
-- Cambios vs v1:
--   ✓ storefront_packages eliminado (era duplicado del catálogo)
--   ✓ storefront_listings agregado (overlay con FK a packages)
--   ✓ storefront_transactions eliminado (fusionado en pagos unificado)
--   ✓ pagos refactorizado: package_id obligatorio, no parciales, descuentos con razón
--   ✓ Migración legacy con flag is_legacy
--   ✓ Triggers para snapshot de precio + validación de descuento
--   ✓ Views para reportes (revenue por paquete, descuentos, ARPU por cohorte)
--
-- Próximos pasos:
--   1. Aplicar en Supabase staging
--   2. Migrar pagos viejos con UPDATE de sección 8a
--   3. Probar inserción de pago en cada source (admin, storefront)
--   4. Verificar RLS con cuenta de usuario fake
--   5. Documentar UI del admin (siguiente entregable)
-- ============================================================================
