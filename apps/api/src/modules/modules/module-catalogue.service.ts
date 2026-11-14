import { getSupabaseUser } from '../../integrations/supabase/client.js';
import { getSupabaseAdmin } from '../../integrations/supabase/client.js';

/**
 * List all active modules from the catalogue.
 * Desktop performs hardware suitability decisions; platform supplies trusted metadata.
 */
export async function listModules(
  userClient: ReturnType<typeof getSupabaseUser>,
) {
  const { data, error } = await userClient
    .from('module_catalogue')
    .select('id, module_id, name, description, category, is_active, is_deprecated, deprecation_date, created_at')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) throw error;

  return {
    modules: (data ?? []).map((m) => ({
      id: m.id,
      moduleId: m.module_id,
      name: m.name,
      description: m.description ?? undefined,
      category: m.category,
      isActive: m.is_active,
      isDeprecated: m.is_deprecated,
      deprecationDate: m.deprecation_date ?? undefined,
      createdAt: m.created_at,
    })),
  };
}

/**
 * Get module versions for a specific module.
 */
export async function listModuleVersions(
  userClient: ReturnType<typeof getSupabaseUser>,
  moduleId: string,
) {
  // First resolve the module catalogue entry
  const { data: module, error: modError } = await userClient
    .from('module_catalogue')
    .select('id')
    .eq('module_id', moduleId)
    .single();

  if (modError || !module) throw new Error('Module not found');

  const { data, error } = await userClient
    .from('module_versions')
    .select('id, version, supported_os, cpu_requirements, memory_requirements_mb, gpu_requirements, vram_requirements_mb, runtime_requirements, capability_declarations, package_size_bytes, package_hash_sha256, compatibility_constraints, release_status, created_at')
    .eq('module_id', module.id)
    .order('version', { ascending: false });

  if (error) throw error;

  return {
    moduleId,
    versions: (data ?? []).map((v) => ({
      id: v.id,
      version: v.version,
      supportedOs: v.supported_os,
      cpuRequirements: v.cpu_requirements ?? undefined,
      memoryRequirementsMb: v.memory_requirements_mb ?? undefined,
      gpuRequirements: v.gpu_requirements ?? undefined,
      vramRequirementsMb: v.vram_requirements_mb ?? undefined,
      runtimeRequirements: v.runtime_requirements ?? undefined,
      capabilityDeclarations: v.capability_declarations as Record<string, boolean>,
      packageSizeBytes: v.package_size_bytes ?? undefined,
      packageHashSha256: v.package_hash_sha256 ?? undefined,
      compatibilityConstraints: v.compatibility_constraints as Record<string, unknown>,
      releaseStatus: v.release_status,
      createdAt: v.created_at,
    })),
  };
}

/**
 * Seed development module catalogue entries.
 * Only callable via trusted server code with service_role.
 * These are DEVELOPMENT FIXTURES ONLY.
 */
export async function seedDevModules(
  adminClient: ReturnType<typeof getSupabaseAdmin>,
) {
  const devModules = [
    {
      module_id: 'stt-whisper-small',
      name: 'Whisper Small Speech-to-Text',
      description: 'Local speech-to-text module using Whisper small model',
      category: 'speech-to-text',
    },
    {
      module_id: 'tts-piper',
      name: 'Piper Text-to-Speech',
      description: 'Local text-to-speech module using Piper',
      category: 'text-to-speech',
    },
    {
      module_id: 'llm-llama-3-8b',
      name: 'Llama 3 8B Local LLM',
      description: 'Local language model module using Llama 3 8B',
      category: 'local-llm',
    },
    {
      module_id: 'vision-clip',
      name: 'CLIP Vision Module',
      description: 'Vision understanding module using CLIP',
      category: 'vision',
    },
  ];

  for (const mod of devModules) {
    const { error } = await adminClient
      .from('module_catalogue')
      .upsert(mod, { onConflict: 'module_id' });

    if (error) throw error;
  }

  return { seeded: devModules.length };
}
