import { getSupabaseUser } from '../../integrations/supabase/client.js';
import { getSupabaseAdmin } from '../../integrations/supabase/client.js';

/**
 * Backup service - opt-in backup coordination metadata.
 * No actual data is stored by the platform; only metadata is tracked.
 * Backups are opt-in with explicit user consent.
 */
export async function getBackupMetadata(
  userClient: ReturnType<typeof getSupabaseUser>,
  userId: string,
  backupCategory: string,
) {
  const { data, error } = await userClient
    .from('backup_metadata')
    .select('id, user_id, backup_category, encryption_enabled, encryption_key_id, retention_days, status, last_backup_at, next_backup_at, created_at, updated_at')
    .eq('user_id', userId)
    .eq('backup_category', backupCategory)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return {
    id: data.id,
    backupCategory: data.backup_category,
    encryptionEnabled: data.encryption_enabled,
    encryptionKeyId: data.encryption_key_id ?? undefined,
    retentionDays: data.retention_days,
    status: data.status,
    lastBackupAt: data.last_backup_at ?? undefined,
    nextBackupAt: data.next_backup_at ?? undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function setBackupMetadata(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  backupCategory: string,
  options: {
    encryptionEnabled?: boolean;
    retentionDays?: number;
    status?: string;
  },
) {
  const { data, error } = await adminClient
    .from('backup_metadata')
    .upsert({
      user_id: userId,
      backup_category: backupCategory,
      encryption_enabled: options.encryptionEnabled ?? false,
      retention_days: options.retentionDays ?? 30,
      status: options.status ?? 'active',
    }, { onConflict: 'user_id, backup_category' })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    backupCategory: data.backup_category,
    encryptionEnabled: data.encryption_enabled,
    retentionDays: data.retention_days,
    status: data.status,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function deleteBackupMetadata(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  backupCategory: string,
) {
  const { error } = await adminClient
    .from('backup_metadata')
    .delete()
    .eq('user_id', userId)
    .eq('backup_category', backupCategory);

  if (error) throw error;

  return { ok: true };
}

export async function getConsentRecord(
  userClient: ReturnType<typeof getSupabaseUser>,
  userId: string,
  consentCategory: string,
) {
  const { data, error } = await userClient
    .from('user_consent_records')
    .select('id, user_id, consent_category, consent_given, consent_timestamp, consent_withdrawn, withdrawn_at, created_at, updated_at')
    .eq('user_id', userId)
    .eq('consent_category', consentCategory)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return {
    id: data.id,
    consentCategory: data.consent_category,
    consentGiven: data.consent_given,
    consentTimestamp: data.consent_timestamp,
    consentWithdrawn: data.consent_withdrawn,
    withdrawnAt: data.withdrawn_at ?? undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function setConsentRecord(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  consentCategory: string,
  consentGiven: boolean,
) {
  const now = new Date().toISOString();
  const { data, error } = await adminClient
    .from('user_consent_records')
    .upsert({
      user_id: userId,
      consent_category: consentCategory,
      consent_given: consentGiven,
      consent_timestamp: now,
      consent_withdrawn: consentGiven ? false : true,
      withdrawn_at: consentGiven ? null : now,
    }, { onConflict: 'user_id, consent_category' })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    consentCategory: data.consent_category,
    consentGiven: data.consent_given,
    consentTimestamp: data.consent_timestamp,
    consentWithdrawn: data.consent_withdrawn,
    withdrawnAt: data.withdrawn_at ?? undefined,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}
