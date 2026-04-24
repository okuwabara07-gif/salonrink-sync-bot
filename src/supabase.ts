import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL?.trim()
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY?.trim()

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required')
}

// Diagnostic logging for SERVICE_KEY
console.log('[Supabase Init] KEY length:', SUPABASE_SERVICE_KEY.length)
console.log('[Supabase Init] KEY starts with:', SUPABASE_SERVICE_KEY.substring(0, 10))
console.log('[Supabase Init] KEY first 5 char codes:', SUPABASE_SERVICE_KEY.substring(0, 5).split('').map(c => c.charCodeAt(0)))

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

export interface SalonCredentials {
  salon_id: string
  hpb_salon_id: string
  hpb_username_encrypted: string
  hpb_password_encrypted: string
}

export interface Reservation {
  hpb_reservation_id: string
  customer_name: string
  menu_name: string
  start_time: string
  end_time: string
  status: string
  raw_data: Record<string, unknown>
}

export async function getAllSalonCredentials(): Promise<SalonCredentials[]> {
  const { data, error } = await supabase
    .from('salon_hpb_credentials')
    .select('salon_id, hpb_salon_id, hpb_username_encrypted, hpb_password_encrypted')

  if (error) {
    throw new Error(`Failed to fetch salon credentials: ${error.message}`)
  }

  return data || []
}

export async function upsertReservations(salonId: string, reservations: Reservation[]): Promise<void> {
  if (reservations.length === 0) {
    console.log(`No reservations to upsert for salon ${salonId}`)
    return
  }

  const records = reservations.map(r => ({
    salon_id: salonId,
    hpb_reservation_id: r.hpb_reservation_id,
    customer_name: r.customer_name,
    menu_name: r.menu_name,
    start_time: r.start_time,
    end_time: r.end_time,
    status: r.status,
    raw_data: r.raw_data,
    synced_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('hpb_reservations')
    .upsert(records, { onConflict: 'hpb_reservation_id' })

  if (error) {
    throw new Error(`Failed to upsert reservations: ${error.message}`)
  }

  console.log(`Upserted ${records.length} reservations for salon ${salonId}`)
}

export async function getSyncStatus(salonId: string): Promise<any> {
  const { data, error } = await supabase
    .from('sync_status')
    .select('*')
    .eq('salon_id', salonId)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get sync status: ${error.message}`)
  }

  return data
}

export async function updateSyncStatus(
  salonId: string,
  status: 'healthy' | 'unhealthy' | 'maintenance',
  error?: string
): Promise<void> {
  const updates: Record<string, any> = {
    salon_id: salonId,
    status,
    updated_at: new Date().toISOString(),
  }

  if (status === 'healthy') {
    updates.last_sync_at = new Date().toISOString()
    updates.last_error = null
    updates.consecutive_failures = 0
  } else {
    updates.last_error = error || null
  }

  const { error: upsertError } = await supabase
    .from('sync_status')
    .upsert(updates, { onConflict: 'salon_id' })

  if (upsertError) {
    throw new Error(`Failed to update sync status: ${upsertError.message}`)
  }

  console.log(`Updated sync status for salon ${salonId} to ${status}`)
}

export async function incrementFailureCount(salonId: string): Promise<{ consecutive_failures: number }> {
  // Get current count
  const current = await getSyncStatus(salonId)
  const newCount = (current?.consecutive_failures || 0) + 1

  const { error } = await supabase
    .from('sync_status')
    .upsert({
      salon_id: salonId,
      consecutive_failures: newCount,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'salon_id' })

  if (error) {
    throw new Error(`Failed to increment failure count: ${error.message}`)
  }

  return { consecutive_failures: newCount }
}

export async function resetFailureCount(salonId: string): Promise<void> {
  const { error } = await supabase
    .from('sync_status')
    .update({
      consecutive_failures: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('salon_id', salonId)

  if (error) {
    throw new Error(`Failed to reset failure count: ${error.message}`)
  }
}
