-- 0001_baseline: schema as built by the legacy ensureDbSchema() (src/migrate.ts) at the baseline commit.
-- Generated with pg_dump --schema-only. Do not edit; add new numbered migrations instead.

--
-- PostgreSQL database dump
--


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

--
-- Name: direct_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.direct_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_user_id uuid NOT NULL,
    recipient_user_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    request_id uuid,
    application_id uuid
);

--
-- Name: email_verification_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verification_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone
);

--
-- Name: feature_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feature_flags (
    key text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: geo_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.geo_cache (
    query text NOT NULL,
    lat double precision NOT NULL,
    lng double precision NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: impact_stories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.impact_stories (
    id integer NOT NULL,
    slug text,
    title text NOT NULL,
    excerpt text NOT NULL,
    body text,
    cover_image_url text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: impact_stories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.impact_stories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: impact_stories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.impact_stories_id_seq OWNED BY public.impact_stories.id;

--
-- Name: opportunities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opportunities (
    id integer NOT NULL,
    title text NOT NULL,
    summary text NOT NULL,
    location text NOT NULL,
    mode text NOT NULL,
    organization_slug text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    location_text text,
    CONSTRAINT opportunities_mode_check CHECK ((mode = ANY (ARRAY['in-person'::text, 'remote'::text, 'hybrid'::text])))
);

--
-- Name: opportunities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.opportunities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: opportunities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.opportunities_id_seq OWNED BY public.opportunities.id;

--
-- Name: org_attendance_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_attendance_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    request_id uuid NOT NULL,
    request_application_id uuid,
    volunteer_user_id uuid NOT NULL,
    check_in_at timestamp with time zone NOT NULL,
    check_out_at timestamp with time zone,
    hours numeric(10,2),
    notes text,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: org_document_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_document_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_document_id uuid NOT NULL,
    request_id uuid,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: org_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    doc_type text NOT NULL,
    title text NOT NULL,
    description text,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    bytes bytea NOT NULL,
    require_ack boolean DEFAULT true NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_documents_doc_type_check CHECK ((doc_type = ANY (ARRAY['waiver'::text, 'training'::text])))
);

--
-- Name: org_incident_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.org_incident_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    request_id uuid,
    request_application_id uuid,
    volunteer_user_id uuid,
    title text NOT NULL,
    description text NOT NULL,
    severity text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    internal_notes text,
    outcome text,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_incident_reports_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT org_incident_reports_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_review'::text, 'resolved'::text, 'closed'::text])))
);

--
-- Name: organization_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_slug text NOT NULL,
    user_id uuid,
    invited_email text,
    role text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    invited_at timestamp with time zone,
    joined_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    invite_token_hash text,
    invite_sent_at timestamp with time zone,
    invite_expires_at timestamp with time zone,
    invite_accepted_at timestamp with time zone,
    CONSTRAINT organization_members_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'member'::text]))),
    CONSTRAINT organization_members_status_check CHECK ((status = ANY (ARRAY['active'::text, 'invited'::text])))
);

--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    slug text NOT NULL,
    name text NOT NULL,
    summary text NOT NULL,
    location text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_user_id uuid,
    mission text,
    website_url text,
    contact_email text,
    logo_url text,
    onboarding_completed boolean DEFAULT false NOT NULL,
    verification_required boolean DEFAULT false NOT NULL,
    verification_status text DEFAULT 'not_required'::text NOT NULL,
    verification_submitted_at timestamp with time zone,
    verification_submission_notes text,
    verification_notes text,
    verified_at timestamp with time zone,
    verified_by_user_id uuid
);

--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone
);

--
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admins (
    user_id uuid NOT NULL,
    role text NOT NULL,
    granted_by_user_id uuid,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    revoked_by_user_id uuid,
    notes text,
    CONSTRAINT platform_admins_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'super'::text])))
);

--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    id integer NOT NULL,
    maintenance_enabled boolean DEFAULT false NOT NULL,
    maintenance_message text,
    updated_by_user_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT platform_settings_id_check CHECK ((id = 1))
);

--
-- Name: platform_settings_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    setting_key text NOT NULL,
    setting_value jsonb NOT NULL,
    changed_by_user_id uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: public_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.public_pages (
    slug text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: request_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.request_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    volunteer_user_id uuid NOT NULL,
    request_id uuid NOT NULL,
    status text NOT NULL,
    message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_to_user_id uuid,
    status_updated_at timestamp with time zone,
    status_updated_by_user_id uuid,
    CONSTRAINT request_applications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'waitlisted'::text, 'rejected'::text, 'withdrawn'::text, 'confirmed'::text, 'completed'::text, 'canceled'::text])))
);

--
-- Name: request_commitments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.request_commitments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    volunteer_user_id uuid NOT NULL,
    request_id uuid,
    status text NOT NULL,
    start_at timestamp with time zone,
    end_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT request_commitments_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'confirmed'::text, 'canceled'::text, 'completed'::text])))
);

--
-- Name: requester_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.requester_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requester_user_id uuid NOT NULL,
    reviewer_user_id uuid,
    request_application_id uuid,
    request_id uuid,
    rating integer NOT NULL,
    strengths text,
    improvements text,
    would_work_again boolean,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT requester_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);

--
-- Name: service_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requester_user_id uuid,
    title text NOT NULL,
    description text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    location_text text,
    mode text,
    needed_by timestamp with time zone,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    requester_org_slug text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    location_lat double precision,
    location_lng double precision,
    CONSTRAINT service_requests_mode_check CHECK ((mode = ANY (ARRAY['in-person'::text, 'remote'::text, 'hybrid'::text]))),
    CONSTRAINT service_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'paused'::text, 'closed'::text])))
);

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    session_token uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    active_org_slug text
);

--
-- Name: share_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.share_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    share_link_id uuid NOT NULL,
    event_type text NOT NULL,
    actor_user_id uuid,
    ip_hash text,
    user_agent text,
    referer text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: share_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.share_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text NOT NULL,
    share_type text NOT NULL,
    target_ref text NOT NULL,
    destination_path text NOT NULL,
    visibility text DEFAULT 'link_only'::text NOT NULL,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    resolve_count integer DEFAULT 0 NOT NULL,
    last_resolved_at timestamp with time zone,
    CONSTRAINT share_links_share_type_check CHECK ((share_type = ANY (ARRAY['PUBLIC_PAGE'::text, 'IMPACT_STORY'::text, 'ORGANIZATION'::text, 'OPPORTUNITY'::text, 'SERVICE_REQUEST'::text, 'VOLUNTEER_PROFILE'::text, 'INVITE'::text]))),
    CONSTRAINT share_links_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'link_only'::text, 'logged_in_only'::text, 'private'::text])))
);

--
-- Name: share_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.share_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    share_link_id uuid NOT NULL,
    reporter_user_id uuid,
    reason text NOT NULL,
    details text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: user_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_availability (
    user_id uuid NOT NULL,
    timezone text NOT NULL,
    days text[] NOT NULL,
    hours_per_week integer NOT NULL,
    remote_ok boolean NOT NULL,
    in_person_ok boolean NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: user_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    blocker_user_id uuid NOT NULL,
    blocked_user_id uuid NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: user_enforcement_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_enforcement_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_user_id uuid NOT NULL,
    action_type text NOT NULL,
    ban_until timestamp with time zone,
    reason text,
    notes text,
    created_by_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_enforcement_actions_action_type_check CHECK ((action_type = ANY (ARRAY['strike'::text, 'ban'::text, 'unban'::text, 'clear_strikes'::text])))
);

--
-- Name: user_notification_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_notification_state (
    user_id uuid NOT NULL,
    last_seen_at timestamp with time zone
);

--
-- Name: user_privacy_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_privacy_settings (
    user_id uuid NOT NULL,
    public_profile_visible boolean DEFAULT true NOT NULL,
    messaging_permission text DEFAULT 'anyone'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_privacy_settings_messaging_permission_check CHECK ((messaging_permission = ANY (ARRAY['anyone'::text, 'verified_only'::text, 'no_one'::text])))
);

--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    user_id uuid NOT NULL,
    full_name text,
    phone text,
    display_name text,
    avatar_url text,
    public_location text,
    location text,
    bio text,
    languages text[] DEFAULT '{}'::text[] NOT NULL,
    interaction_styles text[] DEFAULT '{}'::text[] NOT NULL,
    availability_windows text[] DEFAULT '{}'::text[] NOT NULL,
    help_categories text[] DEFAULT '{}'::text[] NOT NULL,
    has_car boolean,
    can_lift_heavy boolean,
    stairs_ok boolean,
    pet_friendly boolean,
    service_radius_miles integer,
    experience text,
    experience_tags text[] DEFAULT '{}'::text[] NOT NULL,
    need_categories text[] DEFAULT '{}'::text[] NOT NULL,
    need_help_prompt text,
    parking_available boolean,
    elevator_available boolean,
    stairs_present boolean,
    pickup_vs_dropoff text,
    time_flexibility text,
    pets_at_home boolean,
    smoke_free boolean,
    accessibility_needs text,
    meet_in_public_first boolean,
    someone_else_present boolean,
    mask_preferred boolean,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    geo_lat double precision,
    geo_lng double precision,
    geo_updated_at timestamp with time zone
);

--
-- Name: user_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reporter_user_id uuid NOT NULL,
    target_user_id uuid,
    target_request_id uuid,
    category text NOT NULL,
    details text NOT NULL,
    status text DEFAULT 'submitted'::text NOT NULL,
    admin_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT user_reports_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'in_review'::text, 'resolved'::text, 'dismissed'::text])))
);

--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    email_verified_at timestamp with time zone,
    role text,
    profile_completed boolean DEFAULT false NOT NULL,
    availability_completed boolean DEFAULT false NOT NULL,
    verification_required boolean DEFAULT false NOT NULL,
    verification_status text DEFAULT 'not_required'::text NOT NULL,
    onboarding_completed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    account_type text,
    requester_mode text,
    strike_count integer DEFAULT 0 NOT NULL,
    banned_until timestamp with time zone,
    banned_reason text,
    banned_at timestamp with time zone,
    banned_by_user_id uuid,
    verification_submitted_at timestamp with time zone,
    verified_at timestamp with time zone,
    verified_by_user_id uuid,
    verification_notes text,
    phone_verified_at timestamp with time zone,
    CONSTRAINT users_role_check CHECK (((role = ANY (ARRAY['volunteer'::text, 'requester'::text, 'org_admin'::text])) OR (role IS NULL))),
    CONSTRAINT users_verification_status_check CHECK ((verification_status = ANY (ARRAY['not_required'::text, 'required'::text, 'submitted'::text, 'approved'::text, 'rejected'::text])))
);

--
-- Name: verification_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    bytes bytea NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: volunteer_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.volunteer_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    opportunity_id integer NOT NULL,
    status text NOT NULL,
    message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT volunteer_applications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'waitlisted'::text, 'rejected'::text, 'withdrawn'::text, 'confirmed'::text, 'completed'::text, 'canceled'::text])))
);

--
-- Name: volunteer_badge_awards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.volunteer_badge_awards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    volunteer_user_id uuid NOT NULL,
    badge_id text NOT NULL,
    earned_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: volunteer_badge_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.volunteer_badge_state (
    volunteer_user_id uuid NOT NULL,
    last_seen_at timestamp with time zone
);

--
-- Name: volunteer_commitments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.volunteer_commitments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    opportunity_id integer,
    status text NOT NULL,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT volunteer_commitments_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'confirmed'::text, 'canceled'::text, 'completed'::text])))
);

--
-- Name: volunteer_document_acks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.volunteer_document_acks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_document_id uuid NOT NULL,
    volunteer_user_id uuid NOT NULL,
    request_id uuid,
    acknowledged_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: volunteer_impact_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.volunteer_impact_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    volunteer_user_id uuid NOT NULL,
    request_application_id uuid,
    request_id uuid,
    impact_date date DEFAULT CURRENT_DATE NOT NULL,
    hours numeric(10,2) DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: volunteer_outcome_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.volunteer_outcome_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    volunteer_user_id uuid NOT NULL,
    request_application_id uuid,
    request_id uuid,
    outcome_date date DEFAULT CURRENT_DATE NOT NULL,
    outcome text NOT NULL,
    quantity numeric(14,2),
    unit text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: volunteer_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.volunteer_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    volunteer_user_id uuid NOT NULL,
    reviewer_user_id uuid,
    request_application_id uuid,
    request_id uuid,
    rating integer NOT NULL,
    strengths text,
    improvements text,
    would_work_again boolean,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT volunteer_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);

--
-- Name: volunteer_saved_opportunities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.volunteer_saved_opportunities (
    user_id uuid NOT NULL,
    opportunity_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: volunteer_saved_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.volunteer_saved_requests (
    user_id uuid NOT NULL,
    request_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: volunteer_task_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.volunteer_task_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    volunteer_user_id uuid NOT NULL,
    request_application_id uuid,
    request_id uuid,
    task_date date DEFAULT CURRENT_DATE NOT NULL,
    task text NOT NULL,
    duration_hours numeric(10,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: impact_stories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_stories ALTER COLUMN id SET DEFAULT nextval('public.impact_stories_id_seq'::regclass);

--
-- Name: opportunities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities ALTER COLUMN id SET DEFAULT nextval('public.opportunities_id_seq'::regclass);

--
-- Name: direct_messages direct_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_pkey PRIMARY KEY (id);

--
-- Name: email_verification_tokens email_verification_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id);

--
-- Name: email_verification_tokens email_verification_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_token_hash_key UNIQUE (token_hash);

--
-- Name: feature_flags feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feature_flags
    ADD CONSTRAINT feature_flags_pkey PRIMARY KEY (key);

--
-- Name: geo_cache geo_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.geo_cache
    ADD CONSTRAINT geo_cache_pkey PRIMARY KEY (query);

--
-- Name: impact_stories impact_stories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impact_stories
    ADD CONSTRAINT impact_stories_pkey PRIMARY KEY (id);

--
-- Name: opportunities opportunities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_pkey PRIMARY KEY (id);

--
-- Name: org_attendance_logs org_attendance_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_attendance_logs
    ADD CONSTRAINT org_attendance_logs_pkey PRIMARY KEY (id);

--
-- Name: org_document_assignments org_document_assignments_org_document_id_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_document_assignments
    ADD CONSTRAINT org_document_assignments_org_document_id_request_id_key UNIQUE (org_document_id, request_id);

--
-- Name: org_document_assignments org_document_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_document_assignments
    ADD CONSTRAINT org_document_assignments_pkey PRIMARY KEY (id);

--
-- Name: org_documents org_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_documents
    ADD CONSTRAINT org_documents_pkey PRIMARY KEY (id);

--
-- Name: org_incident_reports org_incident_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_incident_reports
    ADD CONSTRAINT org_incident_reports_pkey PRIMARY KEY (id);

--
-- Name: organization_members organization_members_org_slug_invited_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_org_slug_invited_email_key UNIQUE (org_slug, invited_email);

--
-- Name: organization_members organization_members_org_slug_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_org_slug_user_id_key UNIQUE (org_slug, user_id);

--
-- Name: organization_members organization_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_pkey PRIMARY KEY (id);

--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (slug);

--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);

--
-- Name: password_reset_tokens password_reset_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash);

--
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (user_id);

--
-- Name: platform_settings_audit platform_settings_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings_audit
    ADD CONSTRAINT platform_settings_audit_pkey PRIMARY KEY (id);

--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);

--
-- Name: public_pages public_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_pages
    ADD CONSTRAINT public_pages_pkey PRIMARY KEY (slug);

--
-- Name: request_applications request_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_applications
    ADD CONSTRAINT request_applications_pkey PRIMARY KEY (id);

--
-- Name: request_commitments request_commitments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_commitments
    ADD CONSTRAINT request_commitments_pkey PRIMARY KEY (id);

--
-- Name: requester_reviews requester_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requester_reviews
    ADD CONSTRAINT requester_reviews_pkey PRIMARY KEY (id);

--
-- Name: service_requests service_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_pkey PRIMARY KEY (id);

--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

--
-- Name: sessions sessions_session_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_session_token_key UNIQUE (session_token);

--
-- Name: share_events share_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_events
    ADD CONSTRAINT share_events_pkey PRIMARY KEY (id);

--
-- Name: share_links share_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_pkey PRIMARY KEY (id);

--
-- Name: share_links share_links_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_token_key UNIQUE (token);

--
-- Name: share_reports share_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_reports
    ADD CONSTRAINT share_reports_pkey PRIMARY KEY (id);

--
-- Name: user_availability user_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_availability
    ADD CONSTRAINT user_availability_pkey PRIMARY KEY (user_id);

--
-- Name: user_blocks user_blocks_blocker_user_id_blocked_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocker_user_id_blocked_user_id_key UNIQUE (blocker_user_id, blocked_user_id);

--
-- Name: user_blocks user_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_pkey PRIMARY KEY (id);

--
-- Name: user_enforcement_actions user_enforcement_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_enforcement_actions
    ADD CONSTRAINT user_enforcement_actions_pkey PRIMARY KEY (id);

--
-- Name: user_notification_state user_notification_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_state
    ADD CONSTRAINT user_notification_state_pkey PRIMARY KEY (user_id);

--
-- Name: user_privacy_settings user_privacy_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_privacy_settings
    ADD CONSTRAINT user_privacy_settings_pkey PRIMARY KEY (user_id);

--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (user_id);

--
-- Name: user_reports user_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reports
    ADD CONSTRAINT user_reports_pkey PRIMARY KEY (id);

--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);

--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

--
-- Name: verification_documents verification_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_documents
    ADD CONSTRAINT verification_documents_pkey PRIMARY KEY (id);

--
-- Name: volunteer_applications volunteer_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_applications
    ADD CONSTRAINT volunteer_applications_pkey PRIMARY KEY (id);

--
-- Name: volunteer_badge_awards volunteer_badge_awards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_badge_awards
    ADD CONSTRAINT volunteer_badge_awards_pkey PRIMARY KEY (id);

--
-- Name: volunteer_badge_awards volunteer_badge_awards_volunteer_user_id_badge_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_badge_awards
    ADD CONSTRAINT volunteer_badge_awards_volunteer_user_id_badge_id_key UNIQUE (volunteer_user_id, badge_id);

--
-- Name: volunteer_badge_state volunteer_badge_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_badge_state
    ADD CONSTRAINT volunteer_badge_state_pkey PRIMARY KEY (volunteer_user_id);

--
-- Name: volunteer_commitments volunteer_commitments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_commitments
    ADD CONSTRAINT volunteer_commitments_pkey PRIMARY KEY (id);

--
-- Name: volunteer_document_acks volunteer_document_acks_org_document_id_volunteer_user_id_r_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_document_acks
    ADD CONSTRAINT volunteer_document_acks_org_document_id_volunteer_user_id_r_key UNIQUE (org_document_id, volunteer_user_id, request_id);

--
-- Name: volunteer_document_acks volunteer_document_acks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_document_acks
    ADD CONSTRAINT volunteer_document_acks_pkey PRIMARY KEY (id);

--
-- Name: volunteer_impact_entries volunteer_impact_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_impact_entries
    ADD CONSTRAINT volunteer_impact_entries_pkey PRIMARY KEY (id);

--
-- Name: volunteer_outcome_entries volunteer_outcome_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_outcome_entries
    ADD CONSTRAINT volunteer_outcome_entries_pkey PRIMARY KEY (id);

--
-- Name: volunteer_reviews volunteer_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_reviews
    ADD CONSTRAINT volunteer_reviews_pkey PRIMARY KEY (id);

--
-- Name: volunteer_saved_opportunities volunteer_saved_opportunities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_saved_opportunities
    ADD CONSTRAINT volunteer_saved_opportunities_pkey PRIMARY KEY (user_id, opportunity_id);

--
-- Name: volunteer_saved_requests volunteer_saved_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_saved_requests
    ADD CONSTRAINT volunteer_saved_requests_pkey PRIMARY KEY (user_id, request_id);

--
-- Name: volunteer_task_entries volunteer_task_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_task_entries
    ADD CONSTRAINT volunteer_task_entries_pkey PRIMARY KEY (id);

--
-- Name: dm_inbox_ctx_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dm_inbox_ctx_idx ON public.direct_messages USING btree (recipient_user_id, read_at, request_id, application_id, created_at DESC);

--
-- Name: dm_recipient_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dm_recipient_unread_idx ON public.direct_messages USING btree (recipient_user_id, read_at);

--
-- Name: dm_thread_ctx_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dm_thread_ctx_idx ON public.direct_messages USING btree (sender_user_id, recipient_user_id, request_id, application_id, created_at);

--
-- Name: dm_user_pair_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dm_user_pair_idx ON public.direct_messages USING btree (sender_user_id, recipient_user_id, created_at);

--
-- Name: evt_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evt_user_id_idx ON public.email_verification_tokens USING btree (user_id);

--
-- Name: idx_geo_cache_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_geo_cache_updated_at ON public.geo_cache USING btree (updated_at DESC);

--
-- Name: idx_org_members_invite_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_org_members_invite_token_hash ON public.organization_members USING btree (invite_token_hash) WHERE (invite_token_hash IS NOT NULL);

--
-- Name: idx_org_members_org_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_members_org_slug ON public.organization_members USING btree (org_slug);

--
-- Name: idx_org_members_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_org_members_user_id ON public.organization_members USING btree (user_id);

--
-- Name: idx_sessions_active_org_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_active_org_slug ON public.sessions USING btree (active_org_slug);

--
-- Name: idx_share_events_link; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_events_link ON public.share_events USING btree (share_link_id, created_at DESC);

--
-- Name: idx_share_links_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_links_created_by ON public.share_links USING btree (created_by_user_id);

--
-- Name: idx_share_links_share_type_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_links_share_type_target ON public.share_links USING btree (share_type, target_ref);

--
-- Name: idx_share_reports_link; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_reports_link ON public.share_reports USING btree (share_link_id, created_at DESC);

--
-- Name: impact_stories_slug_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX impact_stories_slug_key ON public.impact_stories USING btree (slug);

--
-- Name: org_attendance_logs_checkin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_attendance_logs_checkin_idx ON public.org_attendance_logs USING btree (check_in_at);

--
-- Name: org_attendance_logs_open_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX org_attendance_logs_open_unique ON public.org_attendance_logs USING btree (org_slug, request_id, volunteer_user_id) WHERE (check_out_at IS NULL);

--
-- Name: org_attendance_logs_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_attendance_logs_org_idx ON public.org_attendance_logs USING btree (org_slug);

--
-- Name: org_attendance_logs_req_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_attendance_logs_req_idx ON public.org_attendance_logs USING btree (request_id);

--
-- Name: org_attendance_logs_vol_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_attendance_logs_vol_idx ON public.org_attendance_logs USING btree (volunteer_user_id);

--
-- Name: org_document_assignments_req_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_document_assignments_req_idx ON public.org_document_assignments USING btree (request_id);

--
-- Name: org_documents_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_documents_org_idx ON public.org_documents USING btree (org_slug);

--
-- Name: org_documents_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_documents_type_idx ON public.org_documents USING btree (doc_type);

--
-- Name: org_incident_reports_org_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_incident_reports_org_idx ON public.org_incident_reports USING btree (org_slug);

--
-- Name: org_incident_reports_req_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_incident_reports_req_idx ON public.org_incident_reports USING btree (request_id);

--
-- Name: org_incident_reports_sev_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_incident_reports_sev_idx ON public.org_incident_reports USING btree (severity);

--
-- Name: org_incident_reports_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX org_incident_reports_status_idx ON public.org_incident_reports USING btree (status);

--
-- Name: platform_admins_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX platform_admins_active_idx ON public.platform_admins USING btree (user_id) WHERE (revoked_at IS NULL);

--
-- Name: platform_admins_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX platform_admins_role_idx ON public.platform_admins USING btree (role);

--
-- Name: platform_settings_audit_key_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX platform_settings_audit_key_time_idx ON public.platform_settings_audit USING btree (setting_key, changed_at DESC);

--
-- Name: prt_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prt_user_id_idx ON public.password_reset_tokens USING btree (user_id);

--
-- Name: ra_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ra_request_id_idx ON public.request_applications USING btree (request_id, updated_at DESC);

--
-- Name: ra_volunteer_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ra_volunteer_user_id_idx ON public.request_applications USING btree (volunteer_user_id, updated_at DESC);

--
-- Name: rc_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rc_request_id_idx ON public.request_commitments USING btree (request_id, start_at DESC);

--
-- Name: rc_volunteer_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rc_volunteer_user_id_idx ON public.request_commitments USING btree (volunteer_user_id, start_at DESC);

--
-- Name: rr_requester_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rr_requester_user_id_idx ON public.requester_reviews USING btree (requester_user_id, created_at DESC);

--
-- Name: rr_unique_application_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX rr_unique_application_idx ON public.requester_reviews USING btree (request_application_id) WHERE (request_application_id IS NOT NULL);

--
-- Name: sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_expires_at_idx ON public.sessions USING btree (expires_at);

--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);

--
-- Name: sr_location_lat_lng_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sr_location_lat_lng_idx ON public.service_requests USING btree (location_lat, location_lng);

--
-- Name: sr_requester_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sr_requester_user_id_idx ON public.service_requests USING btree (requester_user_id);

--
-- Name: sr_status_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sr_status_updated_at_idx ON public.service_requests USING btree (status, updated_at DESC);

--
-- Name: ub_blocked_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ub_blocked_idx ON public.user_blocks USING btree (blocked_user_id, created_at DESC);

--
-- Name: ub_blocker_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ub_blocker_idx ON public.user_blocks USING btree (blocker_user_id, created_at DESC);

--
-- Name: uea_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uea_action_idx ON public.user_enforcement_actions USING btree (action_type, created_at DESC);

--
-- Name: uea_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uea_created_by_idx ON public.user_enforcement_actions USING btree (created_by_user_id, created_at DESC);

--
-- Name: uea_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uea_target_idx ON public.user_enforcement_actions USING btree (target_user_id, created_at DESC);

--
-- Name: uns_last_seen_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX uns_last_seen_idx ON public.user_notification_state USING btree (last_seen_at DESC);

--
-- Name: ups_msg_perm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ups_msg_perm_idx ON public.user_privacy_settings USING btree (messaging_permission);

--
-- Name: ups_public_visible_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ups_public_visible_idx ON public.user_privacy_settings USING btree (public_profile_visible);

--
-- Name: ur_reporter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ur_reporter_idx ON public.user_reports USING btree (reporter_user_id, created_at DESC);

--
-- Name: ur_target_request_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ur_target_request_idx ON public.user_reports USING btree (target_request_id, created_at DESC);

--
-- Name: ur_target_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ur_target_user_idx ON public.user_reports USING btree (target_user_id, created_at DESC);

--
-- Name: va_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX va_user_id_idx ON public.volunteer_applications USING btree (user_id);

--
-- Name: vba_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vba_user_idx ON public.volunteer_badge_awards USING btree (volunteer_user_id, earned_at DESC);

--
-- Name: vc_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vc_user_id_idx ON public.volunteer_commitments USING btree (user_id);

--
-- Name: vie_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vie_request_id_idx ON public.volunteer_impact_entries USING btree (request_id);

--
-- Name: vie_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vie_user_id_idx ON public.volunteer_impact_entries USING btree (volunteer_user_id);

--
-- Name: voe_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX voe_request_id_idx ON public.volunteer_outcome_entries USING btree (request_id);

--
-- Name: voe_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX voe_user_id_idx ON public.volunteer_outcome_entries USING btree (volunteer_user_id);

--
-- Name: volunteer_document_acks_req_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX volunteer_document_acks_req_idx ON public.volunteer_document_acks USING btree (request_id);

--
-- Name: volunteer_document_acks_vol_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX volunteer_document_acks_vol_idx ON public.volunteer_document_acks USING btree (volunteer_user_id);

--
-- Name: vr_unique_application_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vr_unique_application_idx ON public.volunteer_reviews USING btree (request_application_id) WHERE (request_application_id IS NOT NULL);

--
-- Name: vr_volunteer_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vr_volunteer_user_id_idx ON public.volunteer_reviews USING btree (volunteer_user_id, created_at DESC);

--
-- Name: vso_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vso_user_id_idx ON public.volunteer_saved_opportunities USING btree (user_id);

--
-- Name: vsr_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vsr_user_id_idx ON public.volunteer_saved_requests USING btree (user_id);

--
-- Name: vte_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vte_request_id_idx ON public.volunteer_task_entries USING btree (request_id);

--
-- Name: vte_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vte_user_id_idx ON public.volunteer_task_entries USING btree (volunteer_user_id);

--
-- Name: direct_messages direct_messages_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_application_id_fkey FOREIGN KEY (application_id) REFERENCES public.request_applications(id) ON DELETE SET NULL;

--
-- Name: direct_messages direct_messages_recipient_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: direct_messages direct_messages_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id) ON DELETE SET NULL;

--
-- Name: direct_messages direct_messages_sender_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.direct_messages
    ADD CONSTRAINT direct_messages_sender_user_id_fkey FOREIGN KEY (sender_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: email_verification_tokens email_verification_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: opportunities opportunities_organization_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_organization_slug_fkey FOREIGN KEY (organization_slug) REFERENCES public.organizations(slug);

--
-- Name: org_attendance_logs org_attendance_logs_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_attendance_logs
    ADD CONSTRAINT org_attendance_logs_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: org_attendance_logs org_attendance_logs_org_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_attendance_logs
    ADD CONSTRAINT org_attendance_logs_org_slug_fkey FOREIGN KEY (org_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;

--
-- Name: org_attendance_logs org_attendance_logs_request_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_attendance_logs
    ADD CONSTRAINT org_attendance_logs_request_application_id_fkey FOREIGN KEY (request_application_id) REFERENCES public.request_applications(id) ON DELETE SET NULL;

--
-- Name: org_attendance_logs org_attendance_logs_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_attendance_logs
    ADD CONSTRAINT org_attendance_logs_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id) ON DELETE CASCADE;

--
-- Name: org_attendance_logs org_attendance_logs_volunteer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_attendance_logs
    ADD CONSTRAINT org_attendance_logs_volunteer_user_id_fkey FOREIGN KEY (volunteer_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: org_document_assignments org_document_assignments_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_document_assignments
    ADD CONSTRAINT org_document_assignments_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: org_document_assignments org_document_assignments_org_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_document_assignments
    ADD CONSTRAINT org_document_assignments_org_document_id_fkey FOREIGN KEY (org_document_id) REFERENCES public.org_documents(id) ON DELETE CASCADE;

--
-- Name: org_document_assignments org_document_assignments_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_document_assignments
    ADD CONSTRAINT org_document_assignments_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id) ON DELETE CASCADE;

--
-- Name: org_documents org_documents_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_documents
    ADD CONSTRAINT org_documents_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: org_documents org_documents_org_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_documents
    ADD CONSTRAINT org_documents_org_slug_fkey FOREIGN KEY (org_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;

--
-- Name: org_incident_reports org_incident_reports_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_incident_reports
    ADD CONSTRAINT org_incident_reports_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: org_incident_reports org_incident_reports_org_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_incident_reports
    ADD CONSTRAINT org_incident_reports_org_slug_fkey FOREIGN KEY (org_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;

--
-- Name: org_incident_reports org_incident_reports_request_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_incident_reports
    ADD CONSTRAINT org_incident_reports_request_application_id_fkey FOREIGN KEY (request_application_id) REFERENCES public.request_applications(id) ON DELETE SET NULL;

--
-- Name: org_incident_reports org_incident_reports_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_incident_reports
    ADD CONSTRAINT org_incident_reports_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id) ON DELETE SET NULL;

--
-- Name: org_incident_reports org_incident_reports_volunteer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.org_incident_reports
    ADD CONSTRAINT org_incident_reports_volunteer_user_id_fkey FOREIGN KEY (volunteer_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: organization_members organization_members_org_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_org_slug_fkey FOREIGN KEY (org_slug) REFERENCES public.organizations(slug) ON DELETE CASCADE;

--
-- Name: organization_members organization_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: organizations organizations_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id);

--
-- Name: organizations organizations_verified_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_verified_by_user_id_fkey FOREIGN KEY (verified_by_user_id) REFERENCES public.users(id);

--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: platform_admins platform_admins_granted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_granted_by_user_id_fkey FOREIGN KEY (granted_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: platform_admins platform_admins_revoked_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_revoked_by_user_id_fkey FOREIGN KEY (revoked_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: platform_admins platform_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: platform_settings_audit platform_settings_audit_changed_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings_audit
    ADD CONSTRAINT platform_settings_audit_changed_by_user_id_fkey FOREIGN KEY (changed_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: platform_settings platform_settings_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: request_applications request_applications_assigned_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_applications
    ADD CONSTRAINT request_applications_assigned_to_user_id_fkey FOREIGN KEY (assigned_to_user_id) REFERENCES public.users(id);

--
-- Name: request_applications request_applications_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_applications
    ADD CONSTRAINT request_applications_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id) ON DELETE CASCADE;

--
-- Name: request_applications request_applications_status_updated_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_applications
    ADD CONSTRAINT request_applications_status_updated_by_user_id_fkey FOREIGN KEY (status_updated_by_user_id) REFERENCES public.users(id);

--
-- Name: request_applications request_applications_volunteer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_applications
    ADD CONSTRAINT request_applications_volunteer_user_id_fkey FOREIGN KEY (volunteer_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: request_commitments request_commitments_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_commitments
    ADD CONSTRAINT request_commitments_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id) ON DELETE SET NULL;

--
-- Name: request_commitments request_commitments_volunteer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_commitments
    ADD CONSTRAINT request_commitments_volunteer_user_id_fkey FOREIGN KEY (volunteer_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: requester_reviews requester_reviews_request_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requester_reviews
    ADD CONSTRAINT requester_reviews_request_application_id_fkey FOREIGN KEY (request_application_id) REFERENCES public.request_applications(id) ON DELETE SET NULL;

--
-- Name: requester_reviews requester_reviews_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requester_reviews
    ADD CONSTRAINT requester_reviews_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id) ON DELETE SET NULL;

--
-- Name: requester_reviews requester_reviews_requester_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requester_reviews
    ADD CONSTRAINT requester_reviews_requester_user_id_fkey FOREIGN KEY (requester_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: requester_reviews requester_reviews_reviewer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requester_reviews
    ADD CONSTRAINT requester_reviews_reviewer_user_id_fkey FOREIGN KEY (reviewer_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: service_requests service_requests_requester_org_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_requester_org_slug_fkey FOREIGN KEY (requester_org_slug) REFERENCES public.organizations(slug);

--
-- Name: service_requests service_requests_requester_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_requester_user_id_fkey FOREIGN KEY (requester_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: sessions sessions_active_org_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_active_org_slug_fkey FOREIGN KEY (active_org_slug) REFERENCES public.organizations(slug);

--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: share_events share_events_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_events
    ADD CONSTRAINT share_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: share_events share_events_share_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_events
    ADD CONSTRAINT share_events_share_link_id_fkey FOREIGN KEY (share_link_id) REFERENCES public.share_links(id) ON DELETE CASCADE;

--
-- Name: share_links share_links_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: share_reports share_reports_reporter_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_reports
    ADD CONSTRAINT share_reports_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: share_reports share_reports_share_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_reports
    ADD CONSTRAINT share_reports_share_link_id_fkey FOREIGN KEY (share_link_id) REFERENCES public.share_links(id) ON DELETE CASCADE;

--
-- Name: user_availability user_availability_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_availability
    ADD CONSTRAINT user_availability_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: user_blocks user_blocks_blocked_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocked_user_id_fkey FOREIGN KEY (blocked_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: user_blocks user_blocks_blocker_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocker_user_id_fkey FOREIGN KEY (blocker_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: user_enforcement_actions user_enforcement_actions_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_enforcement_actions
    ADD CONSTRAINT user_enforcement_actions_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: user_enforcement_actions user_enforcement_actions_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_enforcement_actions
    ADD CONSTRAINT user_enforcement_actions_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: user_notification_state user_notification_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_notification_state
    ADD CONSTRAINT user_notification_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: user_privacy_settings user_privacy_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_privacy_settings
    ADD CONSTRAINT user_privacy_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: user_profiles user_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: user_reports user_reports_reporter_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reports
    ADD CONSTRAINT user_reports_reporter_user_id_fkey FOREIGN KEY (reporter_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: user_reports user_reports_target_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reports
    ADD CONSTRAINT user_reports_target_request_id_fkey FOREIGN KEY (target_request_id) REFERENCES public.service_requests(id) ON DELETE SET NULL;

--
-- Name: user_reports user_reports_target_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reports
    ADD CONSTRAINT user_reports_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: users users_banned_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_banned_by_user_id_fkey FOREIGN KEY (banned_by_user_id) REFERENCES public.users(id);

--
-- Name: users users_verified_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_verified_by_user_id_fkey FOREIGN KEY (verified_by_user_id) REFERENCES public.users(id);

--
-- Name: verification_documents verification_documents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification_documents
    ADD CONSTRAINT verification_documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: volunteer_applications volunteer_applications_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_applications
    ADD CONSTRAINT volunteer_applications_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;

--
-- Name: volunteer_applications volunteer_applications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_applications
    ADD CONSTRAINT volunteer_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: volunteer_badge_awards volunteer_badge_awards_volunteer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_badge_awards
    ADD CONSTRAINT volunteer_badge_awards_volunteer_user_id_fkey FOREIGN KEY (volunteer_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: volunteer_badge_state volunteer_badge_state_volunteer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_badge_state
    ADD CONSTRAINT volunteer_badge_state_volunteer_user_id_fkey FOREIGN KEY (volunteer_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: volunteer_commitments volunteer_commitments_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_commitments
    ADD CONSTRAINT volunteer_commitments_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;

--
-- Name: volunteer_commitments volunteer_commitments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_commitments
    ADD CONSTRAINT volunteer_commitments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: volunteer_document_acks volunteer_document_acks_org_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_document_acks
    ADD CONSTRAINT volunteer_document_acks_org_document_id_fkey FOREIGN KEY (org_document_id) REFERENCES public.org_documents(id) ON DELETE CASCADE;

--
-- Name: volunteer_document_acks volunteer_document_acks_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_document_acks
    ADD CONSTRAINT volunteer_document_acks_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id) ON DELETE CASCADE;

--
-- Name: volunteer_document_acks volunteer_document_acks_volunteer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_document_acks
    ADD CONSTRAINT volunteer_document_acks_volunteer_user_id_fkey FOREIGN KEY (volunteer_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: volunteer_impact_entries volunteer_impact_entries_request_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_impact_entries
    ADD CONSTRAINT volunteer_impact_entries_request_application_id_fkey FOREIGN KEY (request_application_id) REFERENCES public.request_applications(id) ON DELETE SET NULL;

--
-- Name: volunteer_impact_entries volunteer_impact_entries_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_impact_entries
    ADD CONSTRAINT volunteer_impact_entries_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id) ON DELETE SET NULL;

--
-- Name: volunteer_impact_entries volunteer_impact_entries_volunteer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_impact_entries
    ADD CONSTRAINT volunteer_impact_entries_volunteer_user_id_fkey FOREIGN KEY (volunteer_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: volunteer_outcome_entries volunteer_outcome_entries_request_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_outcome_entries
    ADD CONSTRAINT volunteer_outcome_entries_request_application_id_fkey FOREIGN KEY (request_application_id) REFERENCES public.request_applications(id) ON DELETE SET NULL;

--
-- Name: volunteer_outcome_entries volunteer_outcome_entries_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_outcome_entries
    ADD CONSTRAINT volunteer_outcome_entries_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id) ON DELETE SET NULL;

--
-- Name: volunteer_outcome_entries volunteer_outcome_entries_volunteer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_outcome_entries
    ADD CONSTRAINT volunteer_outcome_entries_volunteer_user_id_fkey FOREIGN KEY (volunteer_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: volunteer_reviews volunteer_reviews_request_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_reviews
    ADD CONSTRAINT volunteer_reviews_request_application_id_fkey FOREIGN KEY (request_application_id) REFERENCES public.request_applications(id) ON DELETE SET NULL;

--
-- Name: volunteer_reviews volunteer_reviews_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_reviews
    ADD CONSTRAINT volunteer_reviews_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id) ON DELETE SET NULL;

--
-- Name: volunteer_reviews volunteer_reviews_reviewer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_reviews
    ADD CONSTRAINT volunteer_reviews_reviewer_user_id_fkey FOREIGN KEY (reviewer_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: volunteer_reviews volunteer_reviews_volunteer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_reviews
    ADD CONSTRAINT volunteer_reviews_volunteer_user_id_fkey FOREIGN KEY (volunteer_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: volunteer_saved_opportunities volunteer_saved_opportunities_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_saved_opportunities
    ADD CONSTRAINT volunteer_saved_opportunities_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;

--
-- Name: volunteer_saved_opportunities volunteer_saved_opportunities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_saved_opportunities
    ADD CONSTRAINT volunteer_saved_opportunities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: volunteer_saved_requests volunteer_saved_requests_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_saved_requests
    ADD CONSTRAINT volunteer_saved_requests_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id) ON DELETE CASCADE;

--
-- Name: volunteer_saved_requests volunteer_saved_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_saved_requests
    ADD CONSTRAINT volunteer_saved_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: volunteer_task_entries volunteer_task_entries_request_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_task_entries
    ADD CONSTRAINT volunteer_task_entries_request_application_id_fkey FOREIGN KEY (request_application_id) REFERENCES public.request_applications(id) ON DELETE SET NULL;

--
-- Name: volunteer_task_entries volunteer_task_entries_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_task_entries
    ADD CONSTRAINT volunteer_task_entries_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.service_requests(id) ON DELETE SET NULL;

--
-- Name: volunteer_task_entries volunteer_task_entries_volunteer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.volunteer_task_entries
    ADD CONSTRAINT volunteer_task_entries_volunteer_user_id_fkey FOREIGN KEY (volunteer_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- PostgreSQL database dump complete
--



-- Reference data
INSERT INTO public.feature_flags (key, enabled, updated_at) VALUES ('badges', false, NOW());



INSERT INTO public.platform_settings (id, maintenance_enabled, maintenance_message, updated_by_user_id, updated_at) VALUES (1, false, NULL, NULL, NOW());



INSERT INTO public.public_pages (slug, title, body, updated_at) VALUES ('home', 'GiveBack — Where volunteering meets real needs', 'Find flexible volunteer opportunities, offer help to your community, and track your impact — all in one place.

Whether you’re an individual looking to do good, a neighbor requesting support, or an organization coordinating volunteers, GiveBack makes it easy to connect, communicate, and follow through.

Get started by browsing opportunities, or create a free account to apply, message, and log hours.', NOW());
