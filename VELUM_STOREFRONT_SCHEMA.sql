-- ============================================================================
-- VELUM STOREFRONT · DATABASE SCHEMA
-- Supabase Postgres — FASE 10
-- Creado: Mayo 2026
-- ============================================================================
-- Este archivo crea todas las tablas, índices, RLS policies, views y funciones
-- necesarias para el Storefront público de VELUM.
--
-- Asume que ya existen las tablas core de VELUM:
--   gyms, gym_owners, atletas, packages (privadas), classes, bookings
--
-- Para correr:
--   1. Backup de tu DB actual (Supabase → Database → Backups)
--   2. Aplicar este script vía Supabase Studio → SQL Editor o:
--      supabase db push --file VELUM_STOREFRONT_SCHEMA.sql
-- ============================================================================


-- ============================================================================
-- 1. STOREFRONT CONFIG · Configuración pública por gym
-- ============================================================================
CREATE TABLE IF NOT EXISTS gym_storefront (
  gym_id              UUID PRIMARY KEY REFERENCES gyms(id) ON DELETE CASCADE,
  slug                TEXT UNIQUE NOT NULL CHECK (slug ~* '^[a-z0-9-]{3,60}$'),
  is_enabled          BOOLEAN DEFAULT false,
  mode                TEXT DEFAULT 'public' CHECK (mode IN ('public', 'curated', 'private')),

  -- Branding
  hero_image_url      TEXT,
  hero_video_url      TEXT,
  description         TEXT,
  highlights          JSONB DEFAULT '[]'::jsonb,
  about_html          TEXT,
  primary_color       TEXT DEFAULT '#00D4FF',
  show_velum_badge    BOOLEAN DEFAULT true,

  -- Social proof
  google_rating       NUMERIC(2,1),
  google_review_count INTEGER DEFAULT 0,
  social_instagram    TEXT,
  social_facebook     TEXT,
  social_whatsapp     TEXT,
  social_tiktok       TEXT,

  -- Ofertas
  trial_class_enabled BOOLEAN DEFAULT true,
  trial_package_id    UUID,
  free_first_month    BOOLEAN DEFAULT false,

  -- Comisión VELUM
  commission_pct      NUMERIC(5,2) DEFAULT 2.00,
  commission_cap_mxn  INTEGER DEFAULT 5000,
  trial_period_ends_at TIMESTAMPTZ,

  -- Stripe Connect
  stripe_account_id   TEXT,
  stripe_onboarded    BOOLEAN DEFAULT false,

  -- WhatsApp Business
  whatsapp_phone_id   TEXT,
  whatsapp_template_credentials TEXT DEFAULT 'velum_credentials_v1',
  whatsapp_template_recovery TEXT DEFAULT 'velum_cart_recovery_v1',

  -- Meta
  meta_pixel_id       TEXT,
  google_tag_id       TEXT,

  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE gym_storefront IS 'Configuración del storefront público de cada gym (URL pública, branding, comisión)';
COMMENT ON COLUMN gym_storefront.slug IS 'Slug único para URL: myvelum.app/g/{slug}';
COMMENT ON COLUMN gym_storefront.mode IS 'public=anyone buys, curated=approval required, private=invite only';
COMMENT ON COLUMN gym_storefront.commission_pct IS 'Comisión VELUM sobre ventas vía storefront (default 2%)';


-- ============================================================================
-- 2. STOREFRONT PACKAGES · Paquetes expuestos públicamente
-- ============================================================================
CREATE TABLE IF NOT EXISTS storefront_packages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id              UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,

  name                TEXT NOT NULL,
  description         TEXT,
  price_mxn           INTEGER NOT NULL CHECK (price_mxn >= 0),
  original_price_mxn  INTEGER,

  -- Tipo de paquete
  num_classes         INTEGER,
  duration_days       INTEGER NOT NULL,
  recurring           BOOLEAN DEFAULT false,
  recurring_interval  TEXT CHECK (recurring_interval IN ('week', 'month', 'year') OR recurring_interval IS NULL),

  -- Features incluidos
  includes_ia         BOOLEAN DEFAULT false,
  ia_tier             TEXT CHECK (ia_tier IN ('none', 'basic', 'premium') OR ia_tier IS NULL) DEFAULT 'none',
  unlimited_classes   BOOLEAN DEFAULT false,
  features_list       JSONB DEFAULT '[]'::jsonb,

  -- UI
  is_active           BOOLEAN DEFAULT true,
  is_featured         BOOLEAN DEFAULT false,
  badge_text          TEXT,
  sort_order          INTEGER DEFAULT 0,

  -- Stripe
  stripe_price_id     TEXT,
  stripe_product_id   TEXT,

  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_packages_gym_active ON storefront_packages(gym_id, is_active) WHERE is_active = true;
CREATE INDEX idx_packages_featured ON storefront_packages(gym_id, is_featured) WHERE is_featured = true;

COMMENT ON TABLE storefront_packages IS 'Paquetes que el gym muestra públicamente para venta vía Storefront';


-- ============================================================================
-- 3. STOREFRONT VISITS · Tracking de visitas a la página pública
-- ============================================================================
CREATE TABLE IF NOT EXISTS storefront_visits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id              UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  session_id          TEXT NOT NULL,

  visitor_ip          INET,
  user_agent          TEXT,
  referrer            TEXT,

  -- UTM tracking
  utm_source          TEXT,
  utm_medium          TEXT,
  utm_campaign        TEXT,
  utm_content         TEXT,
  utm_term            TEXT,

  -- Device + geo
  device_type         TEXT CHECK (device_type IN ('mobile', 'tablet', 'desktop') OR device_type IS NULL),
  country             TEXT,
  city                TEXT,

  visited_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_visits_gym_date ON storefront_visits(gym_id, visited_at DESC);
CREATE INDEX idx_visits_session ON storefront_visits(session_id);

COMMENT ON TABLE storefront_visits IS 'Cada vez que alguien carga la página pública del gym (anónimo)';


-- ============================================================================
-- 4. STOREFRONT CARTS · Tracking de intención de compra y abandono
-- ============================================================================
CREATE TABLE IF NOT EXISTS storefront_carts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id              UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  session_id          TEXT NOT NULL,
  package_id          UUID REFERENCES storefront_packages(id) ON DELETE SET NULL,

  -- Visitor info (capturada en checkout step 1)
  visitor_email       TEXT,
  visitor_phone       TEXT,
  visitor_name        TEXT,

  -- Estado del carrito
  status              TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'abandoned', 'recovered', 'completed', 'expired')),

  -- Timestamps de seguimiento
  abandoned_at        TIMESTAMPTZ,
  recovery_attempted_at TIMESTAMPTZ,
  recovered_at        TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days'),

  -- Recovery
  recovery_message_sent BOOLEAN DEFAULT false,
  recovery_discount_offered INTEGER DEFAULT 0,

  -- Origen del carrito
  initiated_from_ia   BOOLEAN DEFAULT false,
  ia_conversation_id  UUID,

  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_carts_status_abandoned ON storefront_carts(status, abandoned_at)
  WHERE status = 'abandoned' AND recovery_message_sent = false;
CREATE INDEX idx_carts_gym ON storefront_carts(gym_id, created_at DESC);
CREATE INDEX idx_carts_email ON storefront_carts(visitor_email) WHERE visitor_email IS NOT NULL;

COMMENT ON TABLE storefront_carts IS 'Sesiones de checkout. Si nunca se completa pago en X horas → abandoned → recovery WA';


-- ============================================================================
-- 5. STOREFRONT TRANSACTIONS · Ventas completadas con comisión
-- ============================================================================
CREATE TABLE IF NOT EXISTS storefront_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id              UUID NOT NULL REFERENCES gyms(id) ON DELETE RESTRICT,
  cart_id             UUID REFERENCES storefront_carts(id) ON DELETE SET NULL,
  package_id          UUID REFERENCES storefront_packages(id) ON DELETE RESTRICT,
  user_id             UUID, -- ref a auth.users (atleta creado/asociado)

  -- Stripe
  stripe_payment_intent_id TEXT NOT NULL UNIQUE,
  stripe_charge_id    TEXT,
  stripe_customer_id  TEXT,
  stripe_account_id   TEXT, -- Connect account del gym

  -- Montos (todo en centavos / no centavos según prefieras — usar INTEGER MXN consistente)
  gross_amount_mxn        INTEGER NOT NULL CHECK (gross_amount_mxn >= 0),
  stripe_fee_mxn          INTEGER DEFAULT 0,
  velum_commission_mxn    INTEGER NOT NULL DEFAULT 0,
  net_to_gym_mxn          INTEGER NOT NULL CHECK (net_to_gym_mxn >= 0),

  currency            TEXT DEFAULT 'MXN' CHECK (currency IN ('MXN', 'USD', 'COP', 'PEN', 'BRL', 'EUR')),

  -- Status
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'refunded', 'partially_refunded', 'disputed', 'failed')),

  -- Refunds
  refunded_at         TIMESTAMPTZ,
  refund_amount_mxn   INTEGER,
  refund_reason       TEXT,

  -- Origen
  origin              TEXT DEFAULT 'storefront'
    CHECK (origin IN ('storefront', 'ia_chat', 'cart_recovery', 'qr_code', 'direct_link')),

  -- Visitor snapshot (por si después se borra el cart)
  customer_email      TEXT,
  customer_phone      TEXT,
  customer_name       TEXT,

  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_transactions_gym ON storefront_transactions(gym_id, created_at DESC);
CREATE INDEX idx_transactions_user ON storefront_transactions(user_id);
CREATE INDEX idx_transactions_stripe_pi ON storefront_transactions(stripe_payment_intent_id);
CREATE INDEX idx_transactions_status ON storefront_transactions(status, created_at DESC);

COMMENT ON TABLE storefront_transactions IS 'Cada venta completada vía Storefront. Aquí se calcula y registra la comisión VELUM.';


-- ============================================================================
-- 6. IA CONVERSATIONS PUBLIC · Chats de Coach IA en venta
-- ============================================================================
CREATE TABLE IF NOT EXISTS ia_conversations_public (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id              UUID NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  session_id          TEXT NOT NULL,

  -- Captured during conversation
  visitor_email       TEXT,
  visitor_phone       TEXT,
  visitor_name        TEXT,

  -- Messages stored as JSONB array of {role, content, ts, tokens}
  messages            JSONB DEFAULT '[]'::jsonb,

  -- Outcome
  package_recommended UUID REFERENCES storefront_packages(id) ON DELETE SET NULL,
  led_to_purchase     BOOLEAN DEFAULT false,
  cart_id             UUID REFERENCES storefront_carts(id) ON DELETE SET NULL,
  transaction_id      UUID REFERENCES storefront_transactions(id) ON DELETE SET NULL,

  -- Cost tracking
  total_input_tokens  INTEGER DEFAULT 0,
  total_cached_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  estimated_cost_usd  NUMERIC(10,4) DEFAULT 0,

  -- Quality
  user_rated_helpful  BOOLEAN,

  created_at          TIMESTAMPTZ DEFAULT now(),
  last_message_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ia_conv_gym ON ia_conversations_public(gym_id, created_at DESC);
CREATE INDEX idx_ia_conv_purchase ON ia_conversations_public(led_to_purchase) WHERE led_to_purchase = true;
CREATE INDEX idx_ia_conv_session ON ia_conversations_public(session_id);

COMMENT ON TABLE ia_conversations_public IS 'Conversaciones de Coach IA en el Storefront público (antes de comprar)';


-- ============================================================================
-- 7. COMMISSION PAYOUTS · Cobros mensuales de comisión a gyms
-- ============================================================================
CREATE TABLE IF NOT EXISTS commission_payouts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id              UUID NOT NULL REFERENCES gyms(id) ON DELETE RESTRICT,

  period_start        DATE NOT NULL,
  period_end          DATE NOT NULL,

  total_gross_mxn     INTEGER NOT NULL DEFAULT 0,
  total_commission_mxn INTEGER NOT NULL DEFAULT 0,
  transaction_count   INTEGER NOT NULL DEFAULT 0,
  capped_at_mxn       INTEGER, -- si llegó al cap

  status              TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'invoiced', 'paid', 'failed', 'waived')),

  stripe_invoice_id   TEXT,
  paid_at             TIMESTAMPTZ,

  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_payouts_gym_period ON commission_payouts(gym_id, period_start DESC);
CREATE UNIQUE INDEX idx_payouts_gym_period_unique ON commission_payouts(gym_id, period_start);

COMMENT ON TABLE commission_payouts IS 'Liquidación mensual de comisión VELUM por gym';


-- ============================================================================
-- 8. ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS en todas las tablas
ALTER TABLE gym_storefront           ENABLE ROW LEVEL SECURITY;
ALTER TABLE storefront_packages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE storefront_visits        ENABLE ROW LEVEL SECURITY;
ALTER TABLE storefront_carts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE storefront_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ia_conversations_public  ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_payouts       ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 8a. POLICIES: gym_storefront
-- ============================================================================
-- Lectura pública SOLO de storefronts enabled (anónimos pueden ver)
CREATE POLICY "Public read enabled storefronts" ON gym_storefront
  FOR SELECT TO anon, authenticated
  USING (is_enabled = true);

-- Dueños del gym pueden hacer todo en SU storefront
CREATE POLICY "Owners manage own storefront" ON gym_storefront
  FOR ALL TO authenticated
  USING (
    gym_id IN (
      SELECT gym_id FROM gym_owners WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    gym_id IN (
      SELECT gym_id FROM gym_owners WHERE user_id = auth.uid()
    )
  );

-- Service role bypasses todo (edge functions)


-- ============================================================================
-- 8b. POLICIES: storefront_packages
-- ============================================================================
CREATE POLICY "Public read active packages of enabled gyms" ON storefront_packages
  FOR SELECT TO anon, authenticated
  USING (
    is_active = true
    AND gym_id IN (SELECT gym_id FROM gym_storefront WHERE is_enabled = true)
  );

CREATE POLICY "Owners manage own packages" ON storefront_packages
  FOR ALL TO authenticated
  USING (
    gym_id IN (SELECT gym_id FROM gym_owners WHERE user_id = auth.uid())
  )
  WITH CHECK (
    gym_id IN (SELECT gym_id FROM gym_owners WHERE user_id = auth.uid())
  );


-- ============================================================================
-- 8c. POLICIES: storefront_visits (solo service role escribe, owners leen)
-- ============================================================================
CREATE POLICY "Owners read own visits" ON storefront_visits
  FOR SELECT TO authenticated
  USING (
    gym_id IN (SELECT gym_id FROM gym_owners WHERE user_id = auth.uid())
  );

-- Inserts solo desde edge functions (service role)


-- ============================================================================
-- 8d. POLICIES: storefront_carts
-- ============================================================================
-- Visitor puede leer/actualizar SU propio cart por session_id (via edge function pasando session)
-- Owners ven todos los carts de su gym
CREATE POLICY "Owners read own carts" ON storefront_carts
  FOR SELECT TO authenticated
  USING (
    gym_id IN (SELECT gym_id FROM gym_owners WHERE user_id = auth.uid())
  );


-- ============================================================================
-- 8e. POLICIES: storefront_transactions (CRÍTICO — financiero)
-- ============================================================================
CREATE POLICY "Owners read own transactions" ON storefront_transactions
  FOR SELECT TO authenticated
  USING (
    gym_id IN (SELECT gym_id FROM gym_owners WHERE user_id = auth.uid())
  );

-- Atleta puede ver SU transacción (la que originó su acceso)
CREATE POLICY "User reads own transaction" ON storefront_transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Solo service role inserta/actualiza (vía Stripe webhook edge function)


-- ============================================================================
-- 8f. POLICIES: ia_conversations_public
-- ============================================================================
CREATE POLICY "Owners read own ia conversations" ON ia_conversations_public
  FOR SELECT TO authenticated
  USING (
    gym_id IN (SELECT gym_id FROM gym_owners WHERE user_id = auth.uid())
  );


-- ============================================================================
-- 8g. POLICIES: commission_payouts
-- ============================================================================
CREATE POLICY "Owners read own payouts" ON commission_payouts
  FOR SELECT TO authenticated
  USING (
    gym_id IN (SELECT gym_id FROM gym_owners WHERE user_id = auth.uid())
  );


-- ============================================================================
-- 9. FUNCTIONS
-- ============================================================================

-- Calcular comisión VELUM con cap mensual
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

  -- Si está en trial period, comisión = 0
  IF v_trial_ends IS NOT NULL AND v_trial_ends > now() THEN
    RETURN 0;
  END IF;

  -- Calcular comisión base
  v_commission := FLOOR(p_gross_amount * v_pct / 100);

  -- Verificar si ya llegó al cap mensual
  SELECT COALESCE(SUM(velum_commission_mxn), 0) INTO v_month_total
  FROM storefront_transactions
  WHERE gym_id = p_gym_id
    AND status = 'completed'
    AND date_trunc('month', created_at) = date_trunc('month', now());

  -- Aplicar cap
  IF v_month_total + v_commission > v_cap THEN
    v_commission := GREATEST(0, v_cap - v_month_total);
  END IF;

  RETURN v_commission;
END;
$$;


-- Auto-marcar carritos como abandonados después de 30 minutos sin completar
CREATE OR REPLACE FUNCTION mark_abandoned_carts()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE storefront_carts
  SET status = 'abandoned',
      abandoned_at = now(),
      updated_at = now()
  WHERE status = 'active'
    AND created_at < now() - INTERVAL '30 minutes'
    AND visitor_email IS NOT NULL; -- solo si capturamos email

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_storefront BEFORE UPDATE ON gym_storefront
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at_packages BEFORE UPDATE ON storefront_packages
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at_carts BEFORE UPDATE ON storefront_carts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at_transactions BEFORE UPDATE ON storefront_transactions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ============================================================================
-- 10. VIEWS · Para dashboard del gym
-- ============================================================================

-- Funnel de conversión por día
CREATE OR REPLACE VIEW v_storefront_funnel AS
SELECT
  v.gym_id,
  DATE(v.visited_at) AS day,
  COUNT(DISTINCT v.session_id) AS visits,
  COUNT(DISTINCT CASE WHEN c.id IS NOT NULL THEN c.session_id END) AS started_checkout,
  COUNT(DISTINCT CASE WHEN c.status = 'abandoned' THEN c.session_id END) AS abandoned,
  COUNT(DISTINCT CASE WHEN c.status = 'recovered' THEN c.session_id END) AS recovered,
  COUNT(DISTINCT CASE WHEN c.status = 'completed' THEN c.session_id END) AS completed,
  COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.gross_amount_mxn END), 0) AS gross_revenue_mxn,
  COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.velum_commission_mxn END), 0) AS velum_commission_mxn,
  COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.net_to_gym_mxn END), 0) AS net_revenue_mxn
FROM storefront_visits v
LEFT JOIN storefront_carts c ON v.session_id = c.session_id AND v.gym_id = c.gym_id
LEFT JOIN storefront_transactions t ON c.id = t.cart_id AND t.status = 'completed'
GROUP BY v.gym_id, DATE(v.visited_at);

COMMENT ON VIEW v_storefront_funnel IS 'Funnel diario: visitas → checkout → completed con revenue para dashboard del gym';


-- IA conversion rate
CREATE OR REPLACE VIEW v_ia_conversion AS
SELECT
  gym_id,
  DATE(created_at) AS day,
  COUNT(*) AS total_conversations,
  COUNT(*) FILTER (WHERE led_to_purchase = true) AS conversions,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE led_to_purchase = true) / NULLIF(COUNT(*), 0),
    2
  ) AS conversion_pct,
  SUM(estimated_cost_usd) AS ia_cost_usd
FROM ia_conversations_public
GROUP BY gym_id, DATE(created_at);


-- Top performing packages
CREATE OR REPLACE VIEW v_top_packages AS
SELECT
  p.gym_id,
  p.id AS package_id,
  p.name,
  p.price_mxn,
  COUNT(t.id) FILTER (WHERE t.status = 'completed') AS total_sales,
  COALESCE(SUM(t.gross_amount_mxn) FILTER (WHERE t.status = 'completed'), 0) AS gross_revenue,
  COALESCE(SUM(t.velum_commission_mxn) FILTER (WHERE t.status = 'completed'), 0) AS velum_revenue
FROM storefront_packages p
LEFT JOIN storefront_transactions t ON p.id = t.package_id
GROUP BY p.gym_id, p.id, p.name, p.price_mxn
ORDER BY total_sales DESC;


-- ============================================================================
-- 11. SEED DATA (DEMO) · Solo para development
-- ============================================================================
-- Comentado por default. Descomenta solo en development.
-- INSERT INTO gym_storefront (gym_id, slug, is_enabled, mode, description, google_rating, google_review_count, social_whatsapp)
-- VALUES (
--   (SELECT id FROM gyms LIMIT 1),
--   'demo-gym',
--   true,
--   'public',
--   'Demo gym for VELUM Storefront',
--   4.9,
--   87,
--   '+524771234567'
-- );


-- ============================================================================
-- FIN DEL SCHEMA
-- ============================================================================
-- Próximos pasos:
-- 1. Aplicar este SQL en Supabase
-- 2. Verificar RLS con usuario de prueba (atleta no debe ver datos de otro gym)
-- 3. Setup Stripe Connect (cuenta por gym)
-- 4. Setup WhatsApp Business API + plantillas aprobadas
-- 5. Deploy edge functions (ver VELUM_STOREFRONT_ARCHITECTURE.md)
-- ============================================================================
