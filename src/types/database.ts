export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AssetType =
  | "logo_pn"
  | "logo_rayon"
  | "logo_nu"
  | "stempel"
  | "signature"
  | "participant_photo"
  | "certificate_pdf"
  | "job_export";
export type EventStatus = "DRAFT" | "SELESAI";
export type ExamResult = "LULUS" | "TIDAK_LULUS";
export type CertificateStatus = "DRAFT" | "TERBIT" | "DICABUT";
export type GenerationJobType = "PUBLISH" | "PDF_COMBINED" | "ZIP";
export type GenerationJobStatus = "MENUNGGU" | "DIPROSES" | "BERHASIL" | "SEBAGIAN_GAGAL" | "GAGAL";
export type GenerationJobItemStatus = "MENUNGGU" | "DIPROSES" | "BERHASIL" | "GAGAL";
export type VerificationStatus = "VALID" | "DICABUT" | "TIDAK_DITEMUKAN" | "BELUM_TERSEDIA";

type TableDefinition<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type WithId = { id: string };
type WithTimestamps = { created_at: string; updated_at: string };

export type AdminProfile = {
  id: string;
  singleton: boolean;
  nama: string;
  email_display: string;
  is_active: boolean;
  created_at: string;
};

export type MediaAsset = {
  id: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  asset_type: AssetType;
  checksum: string | null;
  created_at: string;
};

export type OrganizationSettings = WithId & WithTimestamps & {
  singleton: boolean;
  nama_organisasi: string;
  nama_rayon: string;
  nama_pondok: string | null;
  alamat: string | null;
  kota: string;
  prefix_nomor: string;
  logo_pn_asset_id: string | null;
  logo_rayon_asset_id: string | null;
  logo_nu_asset_id: string | null;
  stempel_asset_id: string | null;
  watermark_opacity: number;
};

export type Signer = WithId & {
  posisi: "kiri" | "kanan";
  nama: string;
  jabatan: string;
  nomor_sp_kta: string;
  signature_asset_id: string | null;
  is_active: boolean;
  updated_at: string;
};

export type UktEvent = WithId & {
  nama: string;
  jenis_kegiatan: string;
  lokasi: string;
  tanggal_mulai: string;
  tanggal_selesai: string;
  tanggal_terbit_default: string;
  periode: string | null;
  deskripsi: string | null;
  status: EventStatus;
  created_at: string;
};

export type Participant = WithId & {
  nama_lengkap: string;
  nomor_anggota: string | null;
  foto_asset_id: string | null;
  created_at: string;
};

export type EventParticipant = WithId & {
  event_id: string;
  participant_id: string;
  tingkat_strip: string;
  hasil_ukt: ExamResult;
  catatan: string | null;
  created_at: string;
};

export type CertificateTemplate = WithId & {
  version: string;
  nama: string;
  config_json: Json;
  is_active: boolean;
  created_at: string;
};

export type Certificate = WithId & WithTimestamps & {
  event_participant_id: string;
  template_id: string;
  nomor_sertifikat: string | null;
  verification_token_hash: string | null;
  status: CertificateStatus;
  data_snapshot: Json;
  signer_snapshot: Json;
  media_snapshot: Json;
  pdf_asset_id: string | null;
  pdf_sha256: string | null;
  issue_locked_at: string | null;
  issued_at: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
  replacement_of_id: string | null;
};

export type CertificateSequence = WithId & {
  scope_key: string;
  last_number: number;
  updated_at: string;
};

export type GenerationJob = WithId & {
  event_id: string;
  job_type: GenerationJobType;
  status: GenerationJobStatus;
  total_items: number;
  completed_items: number;
  failed_items: number;
  requested_by: string | null;
  created_at: string;
  finished_at: string | null;
  output_asset_id: string | null;
  output_file_name: string | null;
  output_error: string | null;
  output_locked_at: string | null;
};

export type GenerationJobItem = WithId & {
  job_id: string;
  certificate_id: string | null;
  status: GenerationJobItemStatus;
  attempts: number;
  error_message: string | null;
  updated_at: string;
};

export type CertificateVerification = WithId & {
  certificate_id: string | null;
  result_status: VerificationStatus;
  verified_at: string;
};

export type AuditLog = WithId & {
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Json;
  created_at: string;
};

type TableName =
  | "admin_profiles"
  | "media_assets"
  | "organization_settings"
  | "signers"
  | "ukt_events"
  | "participants"
  | "event_participants"
  | "certificate_templates"
  | "certificates"
  | "certificate_sequences"
  | "generation_jobs"
  | "generation_job_items"
  | "certificate_verifications"
  | "participant_import_previews"
  | "audit_logs";

type RequiredInsert<Fields, Required extends keyof Fields> = Pick<Fields, Required> & Partial<Omit<Fields, Required>>;

export interface Database {
  public: {
    Tables: {
      admin_profiles: TableDefinition<AdminProfile, RequiredInsert<AdminProfile, "id" | "nama" | "email_display">>;
      media_assets: TableDefinition<MediaAsset, RequiredInsert<MediaAsset, "storage_path" | "mime_type" | "file_size" | "asset_type">>;
      organization_settings: TableDefinition<OrganizationSettings, RequiredInsert<OrganizationSettings, never>>;
      signers: TableDefinition<Signer, RequiredInsert<Signer, "posisi">>;
      ukt_events: TableDefinition<UktEvent, RequiredInsert<UktEvent, "nama" | "lokasi" | "tanggal_mulai" | "tanggal_selesai" | "tanggal_terbit_default">>;
      participants: TableDefinition<Participant, RequiredInsert<Participant, "nama_lengkap">>;
      event_participants: TableDefinition<EventParticipant, RequiredInsert<EventParticipant, "event_id" | "participant_id" | "tingkat_strip" | "hasil_ukt">>;
      certificate_templates: TableDefinition<CertificateTemplate, RequiredInsert<CertificateTemplate, "version" | "nama">>;
      certificates: TableDefinition<Certificate, RequiredInsert<Certificate, "event_participant_id" | "template_id">>;
      certificate_sequences: TableDefinition<CertificateSequence, RequiredInsert<CertificateSequence, "scope_key">>;
      generation_jobs: TableDefinition<GenerationJob, RequiredInsert<GenerationJob, "event_id" | "job_type">>;
      generation_job_items: TableDefinition<GenerationJobItem, RequiredInsert<GenerationJobItem, "job_id">>;
      certificate_verifications: TableDefinition<CertificateVerification, RequiredInsert<CertificateVerification, "result_status">>;
      participant_import_previews: TableDefinition<{
        id: string;
        admin_id: string;
        event_id: string;
        rows_json: Json;
        expires_at: string;
        consumed_at: string | null;
        created_at: string;
      }, RequiredInsert<{
        id?: string;
        admin_id: string;
        event_id: string;
        rows_json: Json;
        expires_at?: string;
        consumed_at?: string | null;
      }, "admin_id" | "event_id" | "rows_json">>;
      audit_logs: TableDefinition<AuditLog, RequiredInsert<AuditLog, "action" | "entity_type">>;
    };
    Views: Record<never, never>;
    Functions: {
      import_event_participants: { Args: { p_event_id: string; p_rows: Json }; Returns: Json };
      reserve_certificate_number: { Args: { p_scope_key: string }; Returns: number };
      allow_certificate_verification: { Args: { p_client_hash: string }; Returns: boolean };
      claim_certificate_issue: { Args: { p_certificate_id: string }; Returns: boolean };
      release_certificate_issue: { Args: { p_certificate_id: string }; Returns: undefined };
      claim_generation_job_export: { Args: { p_job_id: string }; Returns: boolean };
      release_generation_job_export: { Args: { p_job_id: string }; Returns: undefined };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}

export type DatabaseTableName = TableName;
export type TableRow<Name extends TableName> = Database["public"]["Tables"][Name]["Row"];
export type TableInsert<Name extends TableName> = Database["public"]["Tables"][Name]["Insert"];
export type TableUpdate<Name extends TableName> = Database["public"]["Tables"][Name]["Update"];
